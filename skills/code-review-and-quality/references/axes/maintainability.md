# Maintainability & Readability Axis

Focus on future change cost and local cognitive load. This axis owns names, local control and data flow, comments, error context, and the readability of tests and retained implementation.

## Core standard

Another engineer should be able to explain the changed code, predict its side effects, and modify it safely without the author present. The code should make the normal path, exceptional paths, and important constraints visible.

Readable code is not code with the fewest lines. Prefer the smallest accurate mental model.

## Review method

1. Read the changed code once from top to bottom without reconstructing hidden context.
2. Read it again from its call sites and follow the values it consumes and returns.
3. Identify each fact a reader must remember: mutable state, flags, units, implicit ordering, aliases, and special cases.
4. Check whether names, types, structure, or a short rationale can remove that memory burden.
5. Verify that the proposed improvement follows established project patterns.

Report the point where comprehension fails and the change that restores it. Do not request broad cleanup without a concrete maintenance cost.

## Required checks

### 1. Names and domain language

- Do names state the domain role rather than the storage shape or temporary action?
- Are generic names such as `data`, `result`, `value`, `item`, `temp`, and `manager` qualified when the local context does not make them precise?
- Do booleans read as predicates, and do paired names make polarity clear?
- Are units, coordinate systems, time bases, encodings, and ownership visible in names or types?
- Does one concept use one term across code, tests, logs, and documentation?
- Are abbreviations standard in the project and unambiguous to the intended reader?
- Do names that cross a wire, schema, CLI, configuration, or logging boundary preserve the exact canonical spelling and meaning?

Rename when the current name can lead a caller to use the value incorrectly. Do not churn established vocabulary for a synonym.

### 2. Control flow

- Is the primary path easy to scan without stepping through nested conditionals, callbacks, or exception handlers?
- Do guard clauses remove indentation while preserving cleanup and transaction semantics?
- Are conditions named when their business meaning is not obvious from the expression?
- Are positive and negative branches arranged consistently, without double negatives or boolean blindness?
- Does each function stay at a coherent level of abstraction?
- Are mutations close enough to their conditions that the state change is clear?
- Is execution order explicit when later work depends on earlier side effects?

Use guard clauses, exhaustive matches, named predicates, and small local helpers when they clarify retained behavior. Do not extract a helper that merely moves a few obvious lines or forces the reader to jump between files.

### 3. Data flow and local state

- Can a reader see where each important value comes from, how it changes, and where it escapes?
- Are values immutable unless mutation makes the operation clearer or avoids material cost?
- Are temporary representations short-lived and named by meaning?
- Are aliases, shadowed variables, hidden globals, or action-at-a-distance updates obscuring ownership?
- Are calculations separated from effects when this makes both paths easier to reason about and test?
- Do local types prevent invalid combinations or replace parallel booleans and magic strings with one clear concept?

Prefer explicit inputs and outputs over hidden ambient state. Do not require dependency injection or a new type when a direct local value is clearer.

### 4. Functions and interfaces

- Can the function’s purpose be stated in one sentence without “and then” joining unrelated work?
- Does the signature expose required inputs and meaningful outputs without flag-heavy call sites?
- Are defaults, sentinel values, and optional parameters unambiguous at the call site?
- Are side effects visible from the name, receiver, or surrounding API?
- Are errors handled or enriched where useful context exists, without repeated wrapping that hides the cause?
- Does the function preserve project conventions for return values, errors, and ownership?
- Do failures identify the action, relevant object, expected state, and observed state without exposing secrets?

Architecture owns public boundary shape and dependency direction. This axis owns whether the local interface is understandable where it is used.

### 5. Comments and documentation

- Do comments explain why a constraint, workaround, algorithm, or non-obvious ordering exists?
- Are invariants and surprising side effects documented at the narrowest useful location?
- Do public comments describe the caller-visible contract rather than repeat the declaration?
- Are stale comments, copied explanations, disabled code, or misleading examples left behind?
- Are generated files changed through their source and regeneration path rather than patched as independent truth?
- Do quantitative or historical claims name the authoritative artifact, command, version, or date needed to reproduce them?
- Do examples use current flags, paths, and prerequisites, and can a reader run them in the stated context?
- Can clearer code remove a comment that only translates syntax into prose?

Treat a false comment as a defect. Do not request comments for code that can state the fact directly.

### 6. Tests as readable specifications

- Does each test name a behavior and condition rather than an implementation method?
- Is setup limited to facts needed for that behavior?
- Do assertions show the contract failure clearly?
- Are repeated scenarios table-driven or parameterized when that improves comparison and preserves distinct failure output?
- Are helper layers shallow enough that a failing test can be understood without tracing a miniature framework?
- Does shared setup use the test harness lifecycle or a lazy fixture instead of import-time work and ambient process-state mutation?
- When a helper or fixture fails, does the failure identify which contract probe did not reach its intended state?

## Finding bar

A maintainability finding must identify the reader burden and its likely change cost. Point to the confusing name, hidden dependency, control-flow jump, state mutation, or misleading comment, then give a local correction direction.

Do not turn this axis into formatting review. Do not report dead code, obsolete paths, unearned abstractions, broad structural simplifications, or file decomposition. Those belong to dead code and simplification.
