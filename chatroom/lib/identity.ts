export function deviceTokenKey(username: string): string {
  return `chatroom_device_token:${username}`
}

export function pinStatusKey(username: string): string {
  return `chatroom_has_pin:${username}`
}

export function getDeviceToken(username: string): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(deviceTokenKey(username)) || ''
}

export function hasLocalPin(username: string): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(pinStatusKey(username)) === 'true'
}

export function saveClaimedIdentity(username: string, deviceToken: string, hasPin: boolean) {
  localStorage.setItem('chatroom_username', username)
  localStorage.setItem('chatroom_claimed', 'true')
  localStorage.setItem(deviceTokenKey(username), deviceToken)
  localStorage.setItem(pinStatusKey(username), hasPin ? 'true' : 'false')

  // Clear keys from the short-lived recovery-code prototype.
  localStorage.removeItem('chatroom_recovery_code')
  localStorage.removeItem('chatroom_device_token')
  localStorage.removeItem('chatroom_has_pin')
}

export function saveGuestIdentity(username: string) {
  localStorage.setItem('chatroom_username', username)
  localStorage.removeItem('chatroom_claimed')
}

export function setLocalPinStatus(username: string, hasPin: boolean) {
  localStorage.setItem(pinStatusKey(username), hasPin ? 'true' : 'false')
}

export function clearActiveIdentity() {
  // Keep username-specific device tokens so switching identities does not
  // destroy a claimed username on this browser.
  localStorage.removeItem('chatroom_username')
  localStorage.removeItem('chatroom_claimed')
}
