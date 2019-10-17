import { init } from "../src/background";

function setPrefMocks(prefValuesOverrides = {}) {
  const defaultPrefValues = {
    "doh-rollout.enabled": true
  };
  const prefValues = Object.assign({}, defaultPrefValues, prefValuesOverrides);

  jest.spyOn(browser.experiments.preferences, "getUserPref").mockImplementation((prefName, defaultValue)=>{
    const value = prefValues[prefName];
    if (value === undefined) {
      return defaultValue;
    }
    return value;
  });
}

function setBrowserStorageLocal() {
  const storage = {};

  jest.spyOn(browser.storage.local, "get").mockImplementation(async (name) => {
    const value = storage[name];
    if (value === undefined) {
      return {};
    }

    return {[name]: value};
  });

  jest.spyOn(browser.storage.local, "set").mockImplementation((name, value) => {
    storage[name] = value;
  });
}

function setEnterpriseMocks() {
  const defaultEnterprisePolicy = "enable_doh";

  jest.spyOn(browser.experiments.heuristics, "checkEnterprisePolicies").mockImplementation((response)=>{
    if (!response) {
      return defaultEnterprisePolicy;
    }
    return response;
  });
}



// Pref Gatekeeper Check
describe("doh setup start", ()=>{

  it("runs without errors when DoH is disabled", async ()=>{
    setPrefMocks({
      "doh-rollout.enabled": false,
    });
    setBrowserStorageLocal();
    const { setup } = await init();
    expect(setup.enabled).toBeFalsy();
  });

  it("runs without errors when DoH is enabled", async ()=>{
    setPrefMocks({
      "doh-rollout.enabled": true,
      "setup.enabled": true,
    });
    setBrowserStorageLocal();
    const { setup } = await init();
    expect(setup.enabled).toBeTruthy();
  });

});


// Enterprise Checks

describe("Rollout", ()=>{
  it("enables DoH when enterprise policy has no policy set", async ()=>{
    setPrefMocks();
    setBrowserStorageLocal();

    const { rollout } = await init();
    // console.log( await rollout.enterprisePolicyCheck() );
    setEnterpriseMocks();
    console.log( await rollout.getDoHStatus() );
    expect(await rollout.getDoHStatus() ).toBe(undefined);
  });

  it.skip("enables DoH when enterprise policy is set to enable_doh", async ()=>{
    setPrefMocks();
    setBrowserStorageLocal();
    setEnterpriseMocks({
      "policySetting": "enable_doh"
    });
    const { rollout } = await init();
    expect(await rollout.getDoHStatus() ).toBe(undefined);
  });

  it.skip("enables DoH when enterprise policy set to disable_doh", async ()=>{
    setPrefMocks();
    setBrowserStorageLocal();
    setEnterpriseMocks({
      response: "disable_doh"
    });

    const { rollout } = await init();
    expect(await rollout.getDoHStatus() ).toBe(undefined);
  });
});
