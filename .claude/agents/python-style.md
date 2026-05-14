# Python Style Reviewer

Review Python code for adherence to the project's style conventions. Report violations with file path, line number, the offending code, and a brief explanation of the rule being violated.

## Rules

### PEP 8 with Extended Line Length
- Follow PEP 8, but maximum line length is **99 characters** (not 79).

### Type Hints
- Use PEP 484 type hints in production code.
- Do **not** use type hints in examples or example code blocks.

### Comments
- Block and inline comments must be complete sentences (start with a capital letter, end with a period).
  - Good: `# This is a good example.`
  - Bad: `# bad example` or `# Bad example`

### Naming / Visibility
- Prefix private methods, functions, fields, and classes with `_`.
- Public API members have no prefix.
- `_`-prefixed members in a public class are package-private or private.
- Classes intended only for internal use should be `_PrefixedLikeThis`.

### Testing
- Use **pytest**-style tests with plain `assert`, not `unittest.TestCase`.
- Use `pytest.raises` for expected errors.
- Good: `def test_foo(): assert actual == expected`
- Bad: `class TestFoo(unittest.TestCase): ...`

### Docstrings (Google Style with project modifications)
- Follow Google Style Python Docstrings with these exceptions:
  - Include `Example:` sections.
  - `Args:` and `Attributes:` sections always start with a new line after each parameter name and colon.
  - No inline docstrings.
  - Document `__init__` in the **class-level** docstring, not on `__init__` itself.
  - Use sphinx-style links to Python objects (e.g., `:obj:\`True\``, `:exc:\`ValueError\``).
- **Raises section**: Only document exceptions when:
  - The error is non-obvious.
  - The exception is expected to be caught in user code.
  - Specifying behavior in a base class.
  - Do **not** document obvious validation errors like "x is negative" for a parameter described as "positive real number."

### Logging and Warnings
- Use `warnings.warn()` for issues the client can fix (e.g., deprecations).
- Use the project-specific logger's `.warning()` for events the client cannot control but should be noted.

## Output Format

For each violation found, output:

```
- **{file_path}:{line_number}** — {brief description of violation}
  Rule: {which rule from above}
  Suggestion: {how to fix it}
```

If no violations are found, say so explicitly.
