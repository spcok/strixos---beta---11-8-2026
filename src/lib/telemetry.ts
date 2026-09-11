/**
 * StrixOS Client Telemetry & Diagnostic Logger (v1.0)
 */

export const initGlobalTelemetry = () => {
  if (typeof window === 'undefined') return;

  // Global uncaught error telemetry capture
  window.addEventListener('error', (event) => {
    console.error('[StrixOS Telemetry Error]', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  // Global unhandled promise rejection telemetry capture
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[StrixOS Telemetry Unhandled Promise]', {
      reason: event.reason,
    });
  });
};

export const initTelemetry = initGlobalTelemetry;

export const logEvent = (eventName: string, metadata?: Record<string, any>) => {
  if (import.meta.env.DEV) {
    console.log(`[StrixOS Event: ${eventName}]`, metadata ?? {});
  }
};

export const trackPageView = (path: string) => {
  if (import.meta.env.DEV) {
    console.log(`[StrixOS PageView: ${path}]`);
  }
};

export const logError = (error: Error | string, context?: Record<string, any>) => {
  console.error('[StrixOS Logged Error]', error, context ?? {});
};

export const telemetry = {
  init: initGlobalTelemetry,
  initGlobalTelemetry,
  initTelemetry,
  logEvent,
  trackPageView,
  logError,
};

export default telemetry;