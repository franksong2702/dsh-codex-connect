/** Require the complete no-dispatch and explicit-recovery packed-plugin contract. */
export function validRetiredReserveReport(report) {
  return report !== null && typeof report === 'object'
    && ['syntheticOnly', 'retiredModelBlocked', 'explicitOrdinarySelectionVerified', 'legacyFlagIgnored', 'returnFilePreserved'].every(key => report[key] === true)
    && ['quotaNegotiations', 'toolExecutions', 'realProviderRequests'].every(key => report[key] === 0)
}
