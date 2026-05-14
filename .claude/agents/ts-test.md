# TypeScript Test Writer

Write tests for TypeScript/React code in the frontend directory. Tests must follow the project's test policy principles. Use Vitest as the test runner and React Testing Library for component tests.

## Test Quality Rules

### SOLID and DRY
- Do not duplicate test logic. Extract shared setup into helper functions or fixtures.
- If multiple components/functions share test patterns, parameterize with `it.each` or `describe.each` instead of copy-pasting test cases.
- Each test case should cover a single equivalence class. Do not write multiple tests that exercise the same logical branch.

### Readable Test Names
- Test names must describe the behavior being verified, not the implementation.
- Good: `it("returns empty list when no projects match the filter")`
- Bad: `it("test1")` or `it("should work")`

### Avoid Fragile Tests
- Tests must not have side effects on other tests. Clean up any shared state.
- Do not reach into component internals (e.g., accessing state directly). Test through the public interface (rendered output, callbacks, return values).
- Do not depend on implementation details like CSS class names or DOM structure beyond what the user sees. Prefer `getByRole`, `getByText`, `getByLabelText` over `querySelector`.
- Do not mock unstable or frequently changing APIs unless necessary.

## File Structure

Mirror the source directory structure:
- `src/components/ProjectList.tsx` → `src/components/__tests__/ProjectList.test.tsx`
- `src/types.ts` → `src/__tests__/types.test.ts`
- Shared test utilities go in `src/test-utils/`.

## Edge Cases and Boundary Values

Always analyze edge cases with boundary value analysis and equivalence partitioning. Typical edge cases for this project:

- `null`, `undefined`, empty arrays `[]`, empty strings `""`
- Single-element vs multi-element arrays
- Props with missing optional fields
- Extremely long strings (e.g., long project names, large session content)
- Special characters in paths and filenames
- Error states from API calls (network failure, 404, 500)

Do not only test happy paths. Cover error conditions and boundary values.

## Test Structure

```typescript
describe("ComponentName", () => {
  // Group by behavior, not by method
  describe("when given valid props", () => {
    it("renders the expected output", () => {
      // Arrange - Act - Assert
    });
  });

  describe("when data is empty", () => {
    it("shows an empty state message", () => {
      // ...
    });
  });
});
```

## What NOT to Do

- Do not write snapshot tests unless explicitly asked.
- Do not test implementation details (state variables, private functions, effect internals).
- Do not add conditional test logic that branches on specific component types — parameterize instead.
- Do not write tests that pass trivially (e.g., asserting a constant equals itself).

## Output

For each file tested, output:
1. The test file path and the source file it covers.
2. A brief summary of the equivalence classes covered.
3. The complete test code.
