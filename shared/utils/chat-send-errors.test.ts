import { describe, it, expect } from 'vitest';
import { AiErrorConst, CommonErrorConst, describeChatSendError, describeChatRuntimeError, isChatRuntimeErrorCode, readChatSendError, GENERIC_CHAT_SEND_ERROR } from './chat-send-errors';

const body = (...codes: string[]) => ({ resultType: 2, errors: codes.map((code) => ({ code, property: 'Files' })) });

describe('describeChatSendError', () => {
  it.each(Object.entries(AiErrorConst))('has a friendly message for %s (%s)', (_name, code) => {
    // A 500 with no known code would give the generic text, so this proves the code is mapped.
    const message = describeChatSendError(500, body(code));

    expect(message).not.toBe(GENERIC_CHAT_SEND_ERROR);
    expect(message).not.toContain('WKFLOAI');
  });

  it('mirrors every ErrorConst code with a unique value', () => {
    const codes = Object.values(AiErrorConst);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((code) => expect(code).toMatch(/^WKFLOAI\d{4}$/));
  });

  it.each(Object.entries(CommonErrorConst))('has a message for the common code %s (%s)', (_name, code) => {
    // UnexpectedResult maps to the generic text on purpose, so check against the 429 status
    // fallback instead: a mapped code wins over it.
    const message = describeChatSendError(429, body(code));

    expect(message).not.toBe(describeChatSendError(429, null));
    expect(message).not.toContain('WKFLO');
  });

  it('mirrors every CommonErrorConst code with a unique value', () => {
    const codes = Object.values(CommonErrorConst);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((code) => expect(code).toMatch(/^WKFLO\d{4}$/));
  });

  it.each([
    [CommonErrorConst.UnexpectedResult, GENERIC_CHAT_SEND_ERROR],
    [CommonErrorConst.UnauthorizedResult, describeChatSendError(401, null)],
    [CommonErrorConst.NotFound, describeChatSendError(404, null)],
    [CommonErrorConst.InvalidInput, describeChatSendError(400, body(AiErrorConst.InvalidInput))],
    [CommonErrorConst.Required, describeChatSendError(400, body(AiErrorConst.Required))],
    [CommonErrorConst.NoClientId, describeChatSendError(400, body(AiErrorConst.TenantInvalid))],
    [CommonErrorConst.NoTenantId, describeChatSendError(400, body(AiErrorConst.TenantInvalid))],
    [CommonErrorConst.NoDomainId, describeChatSendError(400, body(AiErrorConst.DomainInvalid))],
  ])('maps the common code %s to the matching friendly text', (code, expected) => {
    expect(describeChatSendError(400, body(code))).toBe(expected);
  });

  it('keeps common InvalidInput (WKFLO1001) apart from ChatSessionNotOwned (WKFLOAI1001)', () => {
    const common = describeChatSendError(400, body(CommonErrorConst.InvalidInput));
    const ai = describeChatSendError(400, body(AiErrorConst.ChatSessionNotOwned));

    expect(CommonErrorConst.InvalidInput).toBe('WKFLO1001');
    expect(AiErrorConst.ChatSessionNotOwned).toBe('WKFLOAI1001');
    expect(common).toContain("some of its content isn't valid");
    expect(ai).toContain('another session');
    expect(common).not.toBe(ai);
  });

  it.each([
    ['WKFLOAI0001', 'some of its content isn\'t valid'],
    ['WKFLOAI0002', 'some of its content isn\'t valid'],
    ['WKFLOAI0003', 'some of its content isn\'t valid'],
    ['WKFLOAI0004', 'some of its content isn\'t valid'],
    ['WKFLOAI0014', 'attachments are too large'],
    ['WKFLOAI0015', 'larger than 5.0 MB'],
    ['WKFLOAI0016', 'HEIC, BMP or TIFF'],
    ['WKFLOAI0101', "This chat isn't available right now"],
    ['WKFLOAI0102', "This chat isn't available right now"],
    ['WKFLOAI0302', 'no longer available'],
    ['WKFLOAI0303', 'no longer available'],
    ['WKFLOAI0305', "can't chat right now"],
    ['WKFLOAI0801', "isn't set up yet"],
    ['WKFLOAI0802', "couldn't connect"],
    ['WKFLOAI0901', "couldn't be found"],
    ['WKFLOAI0902', 'already been answered'],
    ['WKFLOAI0903', 'has expired'],
    ['WKFLOAI0904', "couldn't be recorded"],
    ['WKFLOAI1001', 'another session'],
  ])('maps %s to friendly text', (code, expected) => {
    const message = describeChatSendError(400, body(code));

    expect(message).toContain(expected);
    expect(message).not.toContain('WKFLOAI');
  });

  it('uses the first known code and ignores unknown ones', () => {
    expect(describeChatSendError(400, body('WKFLOAI9999', 'WKFLOAI0016', 'WKFLOAI0015')))
      .toBe(describeChatSendError(400, body('WKFLOAI0016')));
  });

  it('reads a top-level code too', () => {
    expect(describeChatSendError(400, { code: 'WKFLOAI0015' })).toBe(describeChatSendError(400, body('WKFLOAI0015')));
  });

  it('a known code wins over the status fallback', () => {
    expect(describeChatSendError(404, body('WKFLOAI0305'))).toContain("can't chat right now");
  });

  it.each([
    [401, 'sign in again'],
    [404, 'no longer available'],
    [413, 'attachments are too large'],
    [429, 'sending messages too quickly'],
  ])('falls back to the %i status text when no code is known', (status, expected) => {
    expect(describeChatSendError(status, body('WKFLOAI9999'))).toContain(expected);
    expect(describeChatSendError(status, null)).toContain(expected);
  });

  it.each([400, 500, 502, 503])('falls back to the generic text for %i', (status) => {
    expect(describeChatSendError(status, null)).toBe(GENERIC_CHAT_SEND_ERROR);
  });

  it.each([undefined, null, 'oops', 42, { errors: 'nope' }, { errors: [null, 7] }])('ignores a malformed body (%s)', (malformed) => {
    expect(describeChatSendError(500, malformed)).toBe(GENERIC_CHAT_SEND_ERROR);
  });
});

describe('readChatSendError', () => {
  it('parses a JSON body', async () => {
    const response = new Response(JSON.stringify(body('WKFLOAI0014')), { status: 400 });

    expect(await readChatSendError(response)).toContain('attachments are too large');
  });

  it('falls back to the status for a non-JSON body and never shows it', async () => {
    const response = new Response('Internal error: stack trace', { status: 500 });

    const message = await readChatSendError(response);

    expect(message).toBe(GENERIC_CHAT_SEND_ERROR);
    expect(message).not.toContain('stack trace');
  });

  it('falls back to the status for an empty body', async () => {
    expect(await readChatSendError(new Response(null, { status: 429 }))).toContain('too quickly');
  });
});

// US 7959: a chat turn that failed while the assistant was answering (approved texts).
describe('describeChatRuntimeError', () => {
  const APPROVED: Array<[string, string]> = [
    ['WKFLOAI1101', 'Something went wrong while answering. Please try again.'],
    ['WKFLOAI1102', 'The assistant took too long to reply. Please try again.'],
    ['WKFLOAI1103', 'The assistant is busy right now. Please wait a moment and try again.'],
    ['WKFLOAI1104', 'The assistant has reached its usage limit. Please contact Support.'],
    ['WKFLOAI1105', "The assistant couldn't connect to its AI service. Please contact Support."],
    ['WKFLOAI1106', "The assistant couldn't answer this message because of its content policy. Please rephrase it and try again."],
    ['WKFLOAI1107', 'This conversation has become too long. Please start a new chat and try again.'],
    ['WKFLOAI1108', "The assistant's AI service isn't available right now. Please try again later."],
    ['WKFLOAI1109', "This assistant isn't set up correctly. Please contact Support."],
    ['WKFLOAI1110', "The assistant didn't return an answer. Please try again."],
    ['WKFLOAI1111', "This assistant isn't available right now. Please refresh the page and try again."],
    ['WKFLOAI1112', "A tool this assistant uses isn't available right now."],
    ['WKFLOAI1113', "A tool this assistant uses isn't available right now."],
    ['WKFLOAI1114', "Your attachment couldn't be processed. Please try again or use a different file."],
    ['WKFLOAI1115', 'Something went wrong on our side. Please try again in a moment.'],
    ['WKFLOAI1116', "The assistants couldn't complete your request. Please try again."],
    ['WKFLOAI1117', "The spoken reply couldn't be played. You can still read the answer in the chat."],
  ];

  it.each(APPROVED)('shows the approved text for %s', (code, expected) => {
    expect(describeChatRuntimeError(code)).toBe(expected);
    expect(describeChatRuntimeError(code)).not.toContain('WKFLO');
  });

  it('mirrors the backend ChatErrorCodes names and values', () => {
    expect(AiErrorConst).toMatchObject({
      ChatTurnFailed: 'WKFLOAI1101',
      ChatModelTimeout: 'WKFLOAI1102',
      ChatModelRateLimited: 'WKFLOAI1103',
      ChatModelQuotaExceeded: 'WKFLOAI1104',
      ChatModelAuthFailed: 'WKFLOAI1105',
      ChatModelContentFiltered: 'WKFLOAI1106',
      ChatModelContextTooLong: 'WKFLOAI1107',
      ChatModelUnavailable: 'WKFLOAI1108',
      ChatModelConfigInvalid: 'WKFLOAI1109',
      ChatModelEmptyResponse: 'WKFLOAI1110',
      ChatAgentUnavailable: 'WKFLOAI1111',
      ChatToolUnavailable: 'WKFLOAI1112',
      ChatToolFailed: 'WKFLOAI1113',
      ChatAttachmentFailed: 'WKFLOAI1114',
      ChatInfrastructureError: 'WKFLOAI1115',
      ChatSubagentFailed: 'WKFLOAI1116',
      ChatVoiceSynthesisFailed: 'WKFLOAI1117',
    });
  });

  it('gives every runtime code its own text, except the two tool warnings that share one', () => {
    const texts = APPROVED.map(([code]) => describeChatRuntimeError(code));
    expect(new Set(texts).size).toBe(texts.length - 1);
    expect(describeChatRuntimeError(AiErrorConst.ChatToolUnavailable)).toBe(describeChatRuntimeError(AiErrorConst.ChatToolFailed));
  });

  it('is never the "couldn\'t be sent" text', () => {
    APPROVED.forEach(([code]) => expect(describeChatRuntimeError(code)).not.toBe(GENERIC_CHAT_SEND_ERROR));
    expect(describeChatRuntimeError('WKFLOAI9999')).not.toBe(GENERIC_CHAT_SEND_ERROR);
  });

  it.each([
    [AiErrorConst.TenantInvalid, "This chat isn't available right now"],
    [AiErrorConst.TenantMustExist, "This chat isn't available right now"],
    [AiErrorConst.AgentMustExist, 'no longer available'],
    [AiErrorConst.AgentNotFound, 'no longer available'],
    [AiErrorConst.AgentNotRunnable, "can't chat right now"],
  ])('shows the text of the detail code %s behind ChatAgentUnavailable', (detailCode, expected) => {
    expect(describeChatRuntimeError(AiErrorConst.ChatAgentUnavailable, detailCode)).toContain(expected);
  });

  it('ignores a detail code that is not allowed, or on another code', () => {
    const agentUnavailable = describeChatRuntimeError(AiErrorConst.ChatAgentUnavailable);

    expect(describeChatRuntimeError(AiErrorConst.ChatAgentUnavailable, AiErrorConst.ImageTooLarge)).toBe(agentUnavailable);
    expect(describeChatRuntimeError(AiErrorConst.ChatAgentUnavailable, 'WKFLOAI9999')).toBe(agentUnavailable);
    expect(describeChatRuntimeError(AiErrorConst.ChatModelTimeout, AiErrorConst.AgentNotFound))
      .toBe(describeChatRuntimeError(AiErrorConst.ChatModelTimeout));
  });

  it.each([undefined, null, '', 'WKFLOAI9999', 'WKFLOAI0302', 'Exception: boom'])('falls back to the ChatTurnFailed text for %s', (code) => {
    expect(describeChatRuntimeError(code)).toBe('Something went wrong while answering. Please try again.');
  });

  it('knows exactly the runtime codes', () => {
    APPROVED.forEach(([code]) => expect(isChatRuntimeErrorCode(code)).toBe(true));
    expect(isChatRuntimeErrorCode(AiErrorConst.ChatSessionNotOwned)).toBe(false);
    expect(isChatRuntimeErrorCode(42)).toBe(false);
  });
});
