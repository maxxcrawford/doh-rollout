"use strict";
/* global browser, runHeuristics */

function log() {
  // eslint-disable-next-line no-constant-condition
  if (false) {
    // eslint-disable-next-line no-console
    console.log(...arguments);
  }
}

const TRR_MODE_PREF = "network.trr.mode";

// This preference is set to TRUE when DoH has been enabled via the add-on. It will
// allow the add-on to continue to function without the aid of the Normandy-triggered pref
// of "doh-rollout.enabled". Note that instead of setting it to false, it is cleared.
const DOH_SELF_ENABLED_PREF = "doh-rollout.self-enabled";

// This pref is set once a migration function has ran, updating local storage items to the
// new doh-rollot.X namespace. This applies to both `doneFirstRun` and `skipHeuristicsCheck`. 
const DOH_BALROG_MIGRATION_PREF = "doh-rollout.balrog-migration";

const stateManager = {
  async setState(state) {
    log("setState: ", state);
    browser.experiments.preferences.state.set({ value: state });

    switch (state) {
    case "uninstalled":
      break;
    case "disabled":
      browser.experiments.preferences.setIntPref(TRR_MODE_PREF, 0);
      browser.experiments.preferences.clearUserPref(DOH_SELF_ENABLED_PREF);
      break;
    case "manuallyDisabled":
      browser.experiments.preferences.clearUserPref(DOH_SELF_ENABLED_PREF);
      break;
    case "UIOk":
      browser.experiments.preferences.setBoolPref(DOH_SELF_ENABLED_PREF, true);
      break;
    case "enabled":
      browser.experiments.preferences.setIntPref(TRR_MODE_PREF, 2);
      browser.experiments.preferences.setBoolPref(DOH_SELF_ENABLED_PREF, true);
      break;
    case "UIDisabled":
      browser.experiments.preferences.setIntPref(TRR_MODE_PREF, 5);
      browser.experiments.preferences.clearUserPref(DOH_SELF_ENABLED_PREF);
      break;
    }

    await browser.experiments.heuristics.sendStatePing(state);
    await stateManager.rememberTRRMode();
  },

  async rememberTRRMode() {
    let curMode = await browser.experiments.preferences.getIntPref(TRR_MODE_PREF, 0);
    log("Saving current trr mode:", curMode);
    await rollout.setSetting("doh-rollout.previous.trr.mode", curMode, true);
  },

  async rememberDoorhangerShown() {
    // This will be shown on startup and netChange events until a user clicks
    // to confirm/disable DoH or presses the esc key (confirming)
    log("Remembering that doorhanger has been shown");
    await rollout.setSetting("doh-rollout.doorhanger-shown", true, true);
  },

  async rememberDoorhangerPingSent() {
    log("Remembering that doorhanger ping has been sent");
    await rollout.setSetting("doh-rollout.doorhanger-ping-sent", true);
  },

  async rememberDoorhangerDecision(decision) {
    log("Remember doorhanger decision:", decision);
    await rollout.setSetting("doh-rollout.doorhanger-decision", decision, true);

  },

  async rememberDisableHeuristics() {
    log("Remembering to never run heuristics again");
    await rollout.setSetting("doh-rollout.disable-heuristics", true, true);
  },

  async shouldRunHeuristics() {
    // Check if heuristics has been disabled from rememberDisableHeuristics()
    let disableHeuristics = await rollout.getSetting("doh-rollout.disable-heuristics", false);
    if (disableHeuristics) {
      // Do not modify DoH for this user.
      log("disableHeuristics has been enabled.");
      return false;
    }

    let prevMode = await rollout.getSetting("doh-rollout.previous.trr.mode", 0);
    let curMode = await browser.experiments.preferences.getIntPref(
      TRR_MODE_PREF, 0);

    log("Comparing previous trr mode to current mode:",
      prevMode, curMode);

    // Don't run heuristics if:
    //  1) Previous doesn't mode equals current mode, i.e. user overrode our changes
    //  2) TRR mode equals 5, i.e. user clicked "No" on doorhanger
    //  3) TRR mode equals 3, i.e. user enabled "strictly on" for DoH
    //  4) They've been disabled in the past for the reasons listed above
    //
    // In other words, if the user has made their own decision for DoH,
    // then we want to respect that and never run the heuristics again

    // On Mismatch - run never run again (make init check a function)

    if (prevMode !== curMode) {
      log("Mismatched, curMode: ", curMode);
      // Cache results for Telemetry send, including setting eval reason
      let results = await runHeuristics();
      results.evaluateReason = "userModified";
      if (curMode === 0 || curMode === 5) {
        // If user has manually set trr.mode to 0, and it was previously something else.
        browser.experiments.heuristics.sendHeuristicsPing("disable_doh", results);
        await stateManager.rememberDisableHeuristics();
      } else {
        // Check if trr.mode is not in default value.
        await rollout.trrModePrefHasUserValue("shouldRunHeuristics_mismatch", results);
      }
      return false;
    }

    return true;

  },

  async shouldShowDoorhanger() {
    let doorhangerShown = await rollout.getSetting("doh-rollout.doorhanger-shown", false);
    log("Should show doorhanger:", !doorhangerShown);
    return !doorhangerShown;
  },

  async showDoorHangerAndEnableDoH() {
    browser.experiments.doorhanger.onDoorhangerAccept.addListener(
      rollout.doorhangerAcceptListener
    );
    browser.experiments.doorhanger.onDoorhangerDecline.addListener(
      rollout.doorhangerDeclineListener
    );
    await browser.experiments.doorhanger.show({
      name: browser.i18n.getMessage("doorhangerName"),
      text: "<> " + browser.i18n.getMessage("doorhangerBody"),
      okLabel: browser.i18n.getMessage("doorhangerButtonOk"),
      okAccessKey: browser.i18n.getMessage("doorhangerButtonOkAccessKey"),
      cancelLabel: browser.i18n.getMessage("doorhangerButtonCancel"),
      cancelAccessKey: browser.i18n.getMessage("doorhangerButtonCancelAccessKey"),
    });

    // Be default, enable DoH when showing the doorhanger,
    // if heuristics returned no reason to not run.
    await stateManager.setState("enabled");
    return;
  }

};


let notificationTime = new Date().getTime() / 1000;

const rollout = {
  async doorhangerAcceptListener(tabId) {
    log("Doorhanger accepted on tab", tabId);
    await stateManager.setState("UIOk");
    await stateManager.rememberDoorhangerDecision("UIOk");
    await stateManager.rememberDoorhangerPingSent();
    await stateManager.rememberDoorhangerShown();
  },

  async doorhangerDeclineListener(tabId) {
    log("Doorhanger declined on tab", tabId);
    await stateManager.setState("UIDisabled");
    await stateManager.rememberDoorhangerDecision("UIDisabled");
    await stateManager.rememberDoorhangerPingSent();
    let results = await runHeuristics();
    results.evaluateReason = "doorhangerDecline";
    browser.experiments.heuristics.sendHeuristicsPing("disable_doh", results);
    await stateManager.rememberDisableHeuristics();
    await stateManager.rememberDoorhangerShown();
  },

  async netChangeListener() {
    // Possible race condition between multiple notifications?
    let curTime = new Date().getTime() / 1000;
    let timePassed = curTime - notificationTime;
    log("Time passed since last network change:", timePassed);
    if (timePassed < 30) {
      return;
    }
    notificationTime = curTime;

    // Run heuristics to determine if DoH should be disabled
    let decision = await rollout.heuristics("netChange");
    if (decision === "disable_doh") {
      await stateManager.setState("disabled");
    } else {
      await stateManager.setState("enabled");
    }
  },

  async heuristics(evaluateReason) {
    // Run heuristics defined in heuristics.js and experiments/heuristics/api.js
    let results = await runHeuristics();

    // Check if DoH should be disabled
    let disablingDoh = Object.values(results).some(item => item === "disable_doh");
    let decision;
    if (disablingDoh) {
      decision = "disable_doh";
    } else {
      decision = "enable_doh";
    }
    log("Heuristics decision on " + evaluateReason + ": " + decision);

    // Send Telemetry on results of heuristics
    results.evaluateReason = evaluateReason;
    browser.experiments.heuristics.sendHeuristicsPing(decision, results);
    return decision;
  },

  async getSetting(name, defaultValue) {
    let data = await browser.storage.local.get(name);
    let value = data[name];
    if (value === undefined) {
      return defaultValue;
    }
    return data[name];
  },

  async setSetting(name, value, makeDurable) {
    await browser.storage.local.set({[name]: value});

    // makeDurable is bool arg that sets same local storage item as durable pref
    // (controlled outside of Extension Preference Manager)
    if (!makeDurable) {
      return;
    }

    // Based on type of pref, set pref accordingly
    switch (typeof value) {
    case "boolean":
      browser.experiments.preferences.setBoolPref(name, value);
      break;
    case "number":
      browser.experiments.preferences.setIntPref(name, value);
      break;
    case "string":
      browser.experiments.preferences.setCharPref(name, value);
      break;
    }
  },

  async trrModePrefHasUserValue(event, results) {

    results.evaluateReason = event;

    // Reset skipHeuristicsCheck
    this.setSetting("doh-rollout.skipHeuristicsCheck", false);

    // This confirms if a user has modified DoH (via the TRR_MODE_PREF) outside of the addon
    // This runs only on the FIRST time that add-on is enabled and if the stored pref
    // mismatches the current pref (Meaning something outside of the add-on has changed it)

    if (
      await browser.experiments.preferences.prefHasUserValue(
        TRR_MODE_PREF)
    ) {
      // Send ping that user had specific trr.mode pref set before add-on study was ran.
      // Note that this does not include the trr.mode - just that the addon cannot be ran.
      browser.experiments.heuristics.sendHeuristicsPing("prefHasUserValue", results);
      await stateManager.rememberDisableHeuristics();
      return;
    }
  },

  async enterprisePolicyCheck(event, results) {
    results.evaluateReason = event;

    // Reset skipHeuristicsCheck
    this.setSetting("doh-rollout.skipHeuristicsCheck", false);

    // Check for Policies before running the rest of the heuristics
    let policyEnableDoH = await browser.experiments.heuristics.checkEnterprisePolicies();

    switch (policyEnableDoH) {
    case "enable_doh":
      log("Policy requires DoH enabled.");
      browser.experiments.heuristics.sendHeuristicsPing(policyEnableDoH, results);
      break;
    case "policy_without_doh":
      log("Policy does not mention DoH.");
      await stateManager.setState("disabled");
      browser.experiments.heuristics.sendHeuristicsPing(policyEnableDoH, results);
      break;
    case "disable_doh":
      log("Policy requires DoH to be disabled.");
      browser.experiments.heuristics.sendHeuristicsPing(policyEnableDoH, results);
      break;
    case "no_policy_set":
    }

    // Determine to skip additional heuristics (by presence of an enterprise policy)
    if (policyEnableDoH === "no_policy_set") {
      // Resetting skipHeuristicsCheck in case a user had a policy and then removed it!
      this.setSetting("doh-rollout.skipHeuristicsCheck", false);
    } else {
      // Don't check for prefHasUserValue if policy is set to disable DoH
      this.setSetting("doh-rollout.skipHeuristicsCheck", true);
    }
    return;

  },

  async migrateLocalStoragePrefs() {
    if (await this.getSetting("doneFirstRun")){
      await this.setSetting("doh-rollout.doneFirstRun");
    }

    if (await this.getSetting("skipHeuristicsCheck")){
      await this.setSetting("doh-rollout.skipHeuristicsCheck");
    }

    // Set pref to skip this function in the future.
    browser.experiments.preferences.setBoolPref(DOH_BALROG_MIGRATION_PREF, true);

  },

  async init() {
    log("calling init");

    // Migrate updated local storage item names. If this has already been done once, it will be skipped.
    const isMigrated = await browser.experiments.preferences.getBoolPref(DOH_BALROG_MIGRATION_PREF, false);

    if (!isMigrated) {
      await this.migrateLocalStoragePrefs();
    }

    // Check if the add-on has run before
    let doneFirstRun = await this.getSetting("doh-rollout.doneFirstRun");

    // Register the events for sending pings
    browser.experiments.heuristics.setupTelemetry();

    // Cache runHeuristics results for first run/start up checks
    let results = await runHeuristics();

    if (!doneFirstRun) {
      log("first run!");
      this.setSetting("doh-rollout.doneFirstRun", true);
      // Check if user has a set a custom pref only on first run, not on each startup
      await this.trrModePrefHasUserValue("first_run", results);
      await this.enterprisePolicyCheck("first_run", results);
    } else {
      log("not first run!");
      await this.enterprisePolicyCheck("startup", results);
    }

    // Only run the heuristics if user hasn't explicitly enabled/disabled DoH
    let skipHeuristicsCheck = await this.getSetting("doh-rollout.skipHeuristicsCheck");
    log("skipHeuristicsCheck: ", skipHeuristicsCheck);

    if (!skipHeuristicsCheck) {
      let shouldRunHeuristics = await stateManager.shouldRunHeuristics();
      if (shouldRunHeuristics) {
        await rollout.main();
      }
    }

    // Listen for network change events to run heuristics again
    browser.experiments.netChange.onConnectionChanged.addListener(async () => {
      log("onConnectionChanged");
      // Only run the heuristics if user hasn't explicitly enabled/disabled DoH
      let shouldRunHeuristics = await stateManager.shouldRunHeuristics();
      let shouldShowDoorhanger = await stateManager.shouldShowDoorhanger();

      if (shouldRunHeuristics) {
        const netChangeDecision = await rollout.heuristics("netChange");
        if (netChangeDecision === "disable_doh") {
          await stateManager.setState("disabled");
        } else if (shouldShowDoorhanger) {
          await stateManager.showDoorHangerAndEnableDoH();
        } else {
          await stateManager.setState("enabled");
        }
      }
    });
  },

  async main() {
    // Listen to the captive portal when it unlocks
    browser.captivePortal.onStateChanged.addListener(rollout.onReady);

    // If the captive portal is already unlocked or doesn't exist,
    // run the measurement
    let captiveState = await browser.captivePortal.getState();
    log("Captive state:", captiveState);
    if ((captiveState === "unlocked_portal") ||
        (captiveState === "not_captive")) {
      await rollout.onReady({state: captiveState});
    }

  },

  async onReady(details) {
    // Now that we're here, stop listening to the captive portal
    browser.captivePortal.onStateChanged.removeListener(rollout.onReady);

    // Only proceed if we're not behind a captive portal
    if ((details.state !== "unlocked_portal") &&
        (details.state !== "not_captive")) {
      return;
    }

    // Run startup heuristics to determine if DoH should be disabled
    let decision = await rollout.heuristics("startup");
    let shouldShowDoorhanger = await stateManager.shouldShowDoorhanger();
    if (decision === "disable_doh") {
      await stateManager.setState("disabled");

    // If the heuristics say to enable DoH, determine if the doorhanger
    // should be shown
    } else if (shouldShowDoorhanger) {
      await stateManager.showDoorHangerAndEnableDoH();
    } else {
      // Doorhanger has been shown before and did not opt-out
      await stateManager.setState("enabled");
    }
  },
};

const setup = {
  async start() {
    const isAddonDisabled = await rollout.getSetting("doh-rollout.disable-heuristics", false);
    const runAddonPref = await browser.experiments.preferences.getBoolPref("doh-rollout.enabled", false);
    const runAddonBypassPref = await browser.experiments.preferences.getBoolPref("doh-rollout.self-enabled", false);
    const runAddonLocalStorage = await rollout.getSetting("doh-rollout.doorhanger-decision", false);
    const remoteDisableAddon = await browser.experiments.preferences.getBoolPref("doh-rollout.remote-disable", false);

    if (isAddonDisabled || remoteDisableAddon) {
      // Regardless of pref, the user has chosen/heuristics dictated that this add-on should be disabled.
      // DoH status will not be modified from whatever the current setting is at runtime
      log("Addon has been disabled. DoH status will not be modified from current setting");
      browser.storage.local.clear();
      await stateManager.rememberDisableHeuristics();
      return;
    }

    if (runAddonPref || runAddonBypassPref || runAddonLocalStorage === "UIOk" || runAddonLocalStorage === "enabled") {
      // Confirms that the Normand/default branch gate keeping pref is set to true
      rollout.init();
    } else {
      log("First run");
    }

    // Set listener for Normandy pref update past inital startup
    browser.experiments.preferences.onPrefChanged.addListener(() => this.start());
  }
};

setup.start();
