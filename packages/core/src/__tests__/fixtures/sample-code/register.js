// Sample source file used by SpecTruth's orchestration tests.

export function register(email, password) {
  const existing = findByEmail(email);
  if (existing) {
    return { status: 409, error: 'Email already exists' };
  }
  return { status: 201, user: createUser(email, password) };
}
