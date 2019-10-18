process.on("unhandledRejection", error => {
  // throw error;
});

// if (global.browser) {
//   throw new Error("Attempting to mock the browser but it already exists.");
// }

// global.browser.storage = {
//   local: {
//     get: jest.fn(),
//     set: jest.fn(),
//   }
// };

global.browser.experiments = {
  heuristics: {
    setupTelemetry: jest.fn(),
    checkParentalControls: jest.fn(),
    checkEnterprisePolicies: jest.fn(),
    checkThirdPartyRoots: jest.fn(),
    sendHeuristicsPing: jest.fn(),
    sendStatePing: jest.fn(),
  },
  netChange: {
    onConnectionChanged: {
      addListener: jest.fn()
    }
  },
  preferences: {
    getUserPref: jest.fn(),
    onPrefChanged: {
      addListener: jest.fn()
    },
    prefHasUserValue: jest.fn(),
    state: {
      set: jest.fn()
    }
  },
  doorhanger: {
    onDoorhangerAccept: {
      addListener: jest.fn()
    },
    onDoorhangerDecline: {
      addListener: jest.fn()
    },
    show: jest.fn(),
  }
};

global.browser.captivePortal = {
  onStateChanged: {
    removeListener: jest.fn(),
    addListener: jest.fn()
  },
  getState: jest.fn()
};