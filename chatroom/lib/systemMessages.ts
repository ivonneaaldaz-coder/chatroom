const SYSTEM_MESSAGES = [
  'welcome to the room.',
  'this room is intentionally unoptimized.',
  'someone just entered quietly.',
  'remember when the internet felt smaller?',
  'no algorithm is watching you here.',
  'you have been disconnected from productivity.',
  'connecting... connected.',
  'this is not a feed.',
  'there are no notifications.',
  'somewhere, a modem is dialing.',
  'you found it.',
  'the internet used to feel like this.',
  'no engagement metrics were harmed in the making of this room.',
  'you are not the product.',
  'away message: living offline.',
]

let messageIndex = 0

export function getNextSystemMessage(): string {
  // Shuffle on first run
  if (messageIndex === 0) {
    for (let i = SYSTEM_MESSAGES.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[SYSTEM_MESSAGES[i], SYSTEM_MESSAGES[j]] = [SYSTEM_MESSAGES[j], SYSTEM_MESSAGES[i]]
    }
  }
  const msg = SYSTEM_MESSAGES[messageIndex % SYSTEM_MESSAGES.length]
  messageIndex++
  return msg
}

// Interval in ms between system messages (3–7 minutes, randomized)
export function nextSystemMessageDelay(): number {
  return Math.floor(Math.random() * 240000) + 180000
}
