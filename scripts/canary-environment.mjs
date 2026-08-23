const SECRET_ENVIRONMENT_NAME = /(?:AUTH|BEARER|COOKIE|CREDENTIAL|JWT|KEY|PASS|SECRET|SESSION|TOKEN)/iu

/** Remove conventional credential-bearing variables before running an upstream candidate. */
export function scrubCanaryEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name, value]) => value !== undefined && !SECRET_ENVIRONMENT_NAME.test(name)),
  )
}
