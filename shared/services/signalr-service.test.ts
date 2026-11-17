import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A stand-in for @microsoft/signalr's HubConnection: start() is controlled by each test and the
// lifecycle callbacks (onreconnecting / onreconnected / onclose) are captured so a test can fire them.
interface FakeConnection {
  state: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  onreconnecting: (cb: () => void) => void;
  onreconnected: (cb: (id?: string) => void) => void;
  onclose: (cb: (error?: Error) => void) => void;
  fireReconnecting: () => void;
  fireReconnected: () => void;
  fireClose: () => void;
}

const fake = vi.hoisted(() => ({
  connections: [] as FakeConnection[],
  startResults: [] as Array<'ok' | 'fail'>,
  automaticReconnectDelays: undefined as number[] | undefined,
}));

vi.mock('@microsoft/signalr', () => {
  const createConnection = (): FakeConnection => {
    let reconnecting = () => {};
    let reconnected = (_id?: string) => {};
    let close = (_error?: Error) => {};
    const connection: FakeConnection = {
      state: 'Disconnected',
      start: vi.fn(async () => {
        connection.state = 'Connecting';
        const result = fake.startResults.shift() ?? 'ok';
        if (result === 'fail') {
          connection.state = 'Disconnected';
          throw new Error('start failed');
        }
        connection.state = 'Connected';
      }),
      stop: vi.fn(async () => { connection.state = 'Disconnected'; }),
      on: vi.fn(),
      invoke: vi.fn(),
      onreconnecting: cb => { reconnecting = cb; },
      onreconnected: cb => { reconnected = cb; },
      onclose: cb => { close = cb; },
      fireReconnecting: () => { connection.state = 'Reconnecting'; reconnecting(); },
      fireReconnected: () => { connection.state = 'Connected'; reconnected('id'); },
      fireClose: () => { connection.state = 'Disconnected'; close(); },
    };
    return connection;
  };

  class HubConnectionBuilder {
    withUrl() { return this; }
    configureLogging() { return this; }
    withServerTimeout() { return this; }
    withKeepAliveInterval() { return this; }
    withAutomaticReconnect(delays?: number[]) { fake.automaticReconnectDelays = delays; return this; }
    build() {
      const connection = createConnection();
      fake.connections.push(connection);
      return connection;
    }
  }

  return {
    HubConnectionBuilder,
    LogLevel: { Warning: 3 },
    HttpTransportType: { WebSockets: 1, LongPolling: 4 },
  };
});

import { SignalRService } from './signalr-service';

describe('SignalRService connection phase (US 7550)', () => {
  beforeEach(() => {
    fake.connections = [];
    fake.startResults = [];
    fake.automaticReconnectDelays = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is connecting before the first connection, then connected', async () => {
    const service = new SignalRService('https://api.example.com');
    expect(service.getConnectionPhase()).toBe('disconnected');

    const phases: string[] = [];
    service.onConnectionStatusChange(() => phases.push(service.getConnectionPhase()));

    await service.connect();

    expect(phases).toEqual(['disconnected', 'connecting', 'connected']);
    expect(service.getConnectionPhase()).toBe('connected');
  });

  it('turns on automatic reconnect', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();

    expect(fake.automaticReconnectDelays).toEqual([0, 2000, 10000, 30000]);
  });

  it('is reconnecting while a dropped connection retries, and connected again once it is back', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();
    const statuses: boolean[] = [];
    service.onConnectionStatusChange(connected => statuses.push(connected));

    fake.connections[0].fireReconnecting();
    expect(service.getConnectionPhase()).toBe('reconnecting');

    fake.connections[0].fireReconnected();
    expect(service.getConnectionPhase()).toBe('connected');
    expect(statuses).toEqual([true, false, true]);
  });

  it('does not open a second connection while the dropped one is reconnecting by itself', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();
    fake.connections[0].fireReconnecting();

    const result = await service.connect();

    expect(result).toBe(false);
    expect(fake.connections).toHaveLength(1);
    expect(service.getConnectionPhase()).toBe('reconnecting');

    fake.connections[0].fireReconnected();
    expect(service.getConnectionPhase()).toBe('connected');
  });

  it('opens a new connection once the automatic retries have given up', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();
    fake.connections[0].fireReconnecting();
    fake.connections[0].fireClose();

    await service.connect();

    expect(fake.connections).toHaveLength(2);
    expect(service.getConnectionPhase()).toBe('connected');
  });

  it('is disconnected once the automatic retries give up', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();

    fake.connections[0].fireReconnecting();
    fake.connections[0].fireClose();

    expect(service.getConnectionPhase()).toBe('disconnected');
  });

  it('stays connecting while a failed first connect has a retry scheduled', async () => {
    vi.useFakeTimers();
    fake.startResults = ['fail', 'ok'];
    const service = new SignalRService('https://api.example.com');

    await service.connect();
    expect(service.getConnectionPhase()).toBe('connecting');

    await vi.advanceTimersByTimeAsync(2000);
    expect(service.getConnectionPhase()).toBe('connected');
  });

  it('stops a connection that is reconnecting by itself when disconnected', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();
    fake.connections[0].fireReconnecting();

    await service.disconnect();

    expect(fake.connections[0].stop).toHaveBeenCalledTimes(1);
    expect(service.getConnectionPhase()).toBe('disconnected');
  });

  it('cancels a scheduled retry of a failed connect when disconnected', async () => {
    vi.useFakeTimers();
    fake.startResults = ['fail', 'ok'];
    const service = new SignalRService('https://api.example.com');
    await service.connect();

    await service.disconnect();
    await vi.advanceTimersByTimeAsync(60000);

    expect(fake.connections).toHaveLength(1);
    expect(service.getConnectionPhase()).toBe('disconnected');
  });

  it('is reconnecting, not connecting, when a manual retry runs after it had been connected', async () => {
    const service = new SignalRService('https://api.example.com');
    await service.connect();
    fake.connections[0].fireClose();

    const phases: string[] = [];
    service.onConnectionStatusChange(() => phases.push(service.getConnectionPhase()));
    await service.connect();

    expect(phases).toEqual(['disconnected', 'reconnecting', 'connected']);
  });
});
