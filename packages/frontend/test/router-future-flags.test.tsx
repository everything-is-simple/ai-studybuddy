import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ActEnvironmentGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const actEnvironment = globalThis as ActEnvironmentGlobal;

describe('React Router future flags', () => {
  let container: HTMLDivElement | null = null;
  let previousActEnvironment: boolean | undefined;

  beforeEach(() => {
    previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    container?.remove();
    container = null;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    vi.restoreAllMocks();
  });

  it('prevents future-flag warnings when both v7 opt-ins are enabled', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    act(() => {
      root.render(
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <span>ready</span>
        </BrowserRouter>,
      );
    });
    await Promise.resolve();

    const futureWarnings = consoleWarn.mock.calls.flat().filter(
      (message): message is string => typeof message === 'string' && message.includes('React Router Future Flag Warning'),
    );
    expect(futureWarnings).toHaveLength(0);

    act(() => root.unmount());
  });
});