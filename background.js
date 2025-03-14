// Import shared utilities if available
try {
  importScripts('shared/utils.js');
} catch (e) {
  console.warn('Could not import shared utilities:', e);
}

// Fallback isGmailUrl function if shared utils are not available
function isGmailUrl(url) {
  return url && url.includes("mail.google.com");
}

// Use the shared utility if available
const checkGmailUrl = (typeof linearUtils !== 'undefined' && linearUtils.isGmailUrl) ? 
  linearUtils.isGmailUrl : isGmailUrl;

// src/background/background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated");
  
  // Remove any existing context menu items to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    // Create the context menu items
    chrome.contextMenus.create({
      id: "sendToLinear",
      title: "Send selection to Linear",
      contexts: ["selection"],
      documentUrlPatterns: ["https://mail.google.com/*"]
    });
    
    chrome.contextMenus.create({
      id: "openLinearModal",
      title: "Open Linear modal",
      contexts: ["page", "frame"],
      documentUrlPatterns: ["https://mail.google.com/*"]
    });
    
    console.log("Context menus created");
  });
});

// Also create the context menu when the extension starts
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: "sendToLinear",
    title: "Send selection to Linear",
    contexts: ["selection"],
    documentUrlPatterns: ["https://mail.google.com/*"]
  });
  
  chrome.contextMenus.create({
    id: "openLinearModal",
    title: "Open Linear modal",
    contexts: ["page", "frame"],
    documentUrlPatterns: ["https://mail.google.com/*"]
  });
  
  console.log("Context menus created on startup");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request);
  if (request.action === "openModal") {
    handleOpenModal(sendResponse);
    return true;
  }
  if (request.action === "extractContent") {
    handleExtractContent(sendResponse);
    return true;
  }
  if (request.action === "submitForm") {
    handleSubmitForm(request, sendResponse);
    return true;
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("Context menu clicked:", info, tab);
  if (info.menuItemId === "sendToLinear") {
    if (info.selectionText) {
      handleContextMenuSelection(info, tab);
    }
  } else if (info.menuItemId === "openLinearModal") {
    handleOpenModalFromContextMenu(tab);
  }
});

// Handler for opening the modal directly from context menu
async function handleOpenModalFromContextMenu(tab) {
  try {
    if (!tab || !checkGmailUrl(tab.url)) {
      console.error("No active Gmail tab found");
      return;
    }
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/shared/utils.js", "/content.js"]
      });
    } catch (error) {
      console.log("Script injection error (may be already injected):", error);
    }
    
    chrome.tabs.sendMessage(tab.id, { action: "openModal" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error opening modal:", chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error("Error opening modal from context menu:", error);
  }
}

async function handleOpenModal(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab || !checkGmailUrl(activeTab.url)) {
      sendResponse({ success: false, error: "No active Gmail tab found" });
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["/shared/utils.js", "/content.js"]
      });
    } catch (error) {
      console.log("Script injection error (may be already injected):", error);
    }
    chrome.tabs.sendMessage(activeTab.id, { action: "openModal" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      sendResponse({ success: true });
    });
  } catch (error) {
    console.error("Error opening modal:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleExtractContent(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab || !checkGmailUrl(activeTab.url)) {
      sendResponse({ success: false, error: "No active Gmail tab found" });
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["/shared/utils.js", "/content.js"]
      });
    } catch (error) {
      console.log("Script injection error (may be already injected):", error);
    }
    chrome.tabs.sendMessage(activeTab.id, { action: "extractContent" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      sendResponse(response);
    });
  } catch (error) {
    console.error("Error extracting content:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSubmitForm(request, sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab || !checkGmailUrl(activeTab.url)) {
      sendResponse({ success: false, error: "No active Gmail tab found" });
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["/shared/utils.js", "/content.js"]
      });
    } catch (error) {
      console.log("Script injection error (may be already injected):", error);
    }
    chrome.tabs.sendMessage(activeTab.id, { action: "submitForm", data: request.data }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      sendResponse(response);
    });
  } catch (error) {
    console.error("Error submitting form:", error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleContextMenuSelection(info, tab) {
  console.log("Context menu selection:", info.selectionText);
  // Store the selected text to use in the popup
  chrome.storage.local.set({ selectedText: info.selectionText }, () => {
    chrome.action.openPopup();
  });
}
