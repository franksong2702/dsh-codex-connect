/** Select Desktop browser-launch/UI behavior only; this does not grant origin trust. */
export function isOfficialDesktopShell(location: Pick<Location, 'protocol' | 'hostname'> = window.location): boolean {
  return location.protocol === 'dsh-app:' && location.hostname === 'app'
}
