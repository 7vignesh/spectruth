# Records API — Tasks

## Implementation Plan

- [x] 1. Add the delete record endpoint
  - Look up the record and remove it
  - _Requirements: 1.1_

- [x] 2. Enforce record ownership on delete
  - Refuse the delete when the caller does not own the record
  - _Requirements: 1.2_

- [ ] 3. Paginate the record list
  - _Requirements: 2.1_
