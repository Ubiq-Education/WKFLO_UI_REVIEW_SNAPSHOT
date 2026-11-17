import React, { useMemo } from 'react';
import { formatChatTimestamp, toDisplayableDate, type DateTimeFormatSettings } from '../utils/format-date-time';

// US 7974: the date/time under a chat bubble or card, in the tenant's time zone and formats (from
// the chat configuration, never the viewer's browser): only the time for a message from today in
// the tenant's zone, otherwise date and time. Renders nothing when the message has no usable
// timestamp (missing, unparseable or the .NET default 0001-01-01).
export interface MessageTimestampProps {
  value: Date | string | null | undefined;
  settings?: DateTimeFormatSettings | null;
  className?: string;
  style?: React.CSSProperties;
}

const MessageTimestampComponent: React.FC<MessageTimestampProps> = ({ value, settings, className, style }) => {
  const date = toDisplayableDate(value);
  const time = date?.getTime();
  const timeZone = settings?.timeZone;
  const timeFormat = settings?.timeFormat;
  const dateFormat = settings?.dateFormat;

  // Keyed on primitives: a streamed bubble re-renders on every token, but its timestamp and the
  // tenant settings don't change, so the text is formatted once.
  const text = useMemo(
    () => (time === undefined ? '' : formatChatTimestamp(new Date(time), { timeZone, timeFormat, dateFormat })),
    [time, timeZone, timeFormat, dateFormat]
  );

  if (!text || time === undefined) return null;

  return (
    <time
      dateTime={new Date(time).toISOString()}
      className={className ?? 'text-xs text-gray-400'}
      style={{ lineHeight: '16px', whiteSpace: 'nowrap', ...style }}
      data-testid="chat-message-timestamp"
    >
      {text}
    </time>
  );
};

export const MessageTimestamp = React.memo(MessageTimestampComponent);
