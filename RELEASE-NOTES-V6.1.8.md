# Time-Clock Enterprise V6.1.8

## Attendance Rebuild Employee ID Fix

- Fixed `column e.emp_code does not exist` when creating an Attendance rebuild job.
- Reads employee code from `employees."EmployeeId"` and supports legacy aliases.
- Reads start/resign dates through JSONB aliases for schema compatibility.
- No frontend changes. Other functions remain unchanged.
