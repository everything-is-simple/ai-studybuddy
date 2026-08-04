// React 18 emits act() diagnostics unless the test environment opts in explicitly.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
