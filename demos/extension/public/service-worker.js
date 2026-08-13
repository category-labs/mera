chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.sidePanel.setOptions({ path: "sidepanel.html?panel=1" });
});
