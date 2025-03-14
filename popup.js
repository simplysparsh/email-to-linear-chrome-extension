(() => {
  // src/popup/popup-ui.js
  function showStatus(message, isError = false) {
    const statusElement = document.getElementById("status");
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.style.display = "block";
    statusElement.className = isError ? "error" : "info";
    if (!isError) {
      setTimeout(() => {
        statusElement.style.display = "none";
      }, 5e3);
    }
  }
  
  function setupFormatButtons() {
    const formatButtons = document.querySelectorAll(".format-btn");
    formatButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const command = button.dataset.format;
        document.execCommand(command, false, null);
        const actionsElement = document.getElementById("actions");
        if (actionsElement) {
          actionsElement.focus();
        }
      });
    });
  }

  // src/shared/utils.js
  function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Consolidated error handling function
  function handleError(error, context, showErrorStatus = true) {
    const errorMessage = error.message || "Unknown error";
    console.error(`Error ${context}:`, error);
    if (showErrorStatus) {
      showStatus(`Error ${context}: ${errorMessage}`, true);
    }
    return {
      success: false,
      error: errorMessage
    };
  }

  async function getActiveGmailTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && linearUtils.isGmailUrl(tabs[0].url)) {
          resolve(tabs[0]);
        } else {
          resolve(null);
        }
      });
    });
  }

  async function createLinearIssue(title, description, priority, assignee, team) {
    try {
      // Instead of using the createLinearIssue action, use submitForm
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "submitForm",
          data: {
            title,
            description,
            team,
            assignee,
            priority,
            content: description
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response || !response.success) {
            reject(new Error(response?.error || "Failed to create issue"));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      return handleError(error, "creating Linear issue", false);
    }
  }

  // src/popup/team-management.js
  function setupDefaultTeams() {
    const teamSelect = document.getElementById("team");
    if (!teamSelect) return;
    
    teamSelect.innerHTML = "";
    
    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select team";
    teamSelect.appendChild(defaultOption);
    
    // Add predefined teams from utils.js
    const teams = linearUtils.getTeamDefinitions();
    teams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;
      teamSelect.appendChild(option);
    });
    
    // Load saved team from storage
    linearUtils.getData("linearTeam", null, true).then(savedTeam => {
      if (savedTeam) {
        // Check if the saved team exists in our options
        const teamExists = Array.from(teamSelect.options).some(opt => opt.value === savedTeam);
        
        if (teamExists) {
          teamSelect.value = savedTeam;
        } else {
          // If team doesn't exist in current options, default to empty
          teamSelect.value = "";
        }
      }
    });
    
    // Setup assignee field
    const assigneeField = document.getElementById("assignee");
    if (assigneeField) {
      // We'll load the saved assignee in the loadSavedAssignee function
      // This is just to ensure the field is properly initialized
      assigneeField.placeholder = "e.g., John Doe or John";
    }
    
    // Add event listener for custom team
    teamSelect.addEventListener("change", function() {
      if (this.value === "CUSTOM") {
        // Prompt for custom team name
        const customTeam = prompt("Enter custom team name:", "");
        if (customTeam && customTeam.trim() !== "") {
          // Create a new option with the custom team name
          const customOption = document.createElement("option");
          customOption.value = customTeam.trim();
          customOption.textContent = customTeam.trim();
          customOption.selected = true;
          teamSelect.appendChild(customOption);
          
          // Save the custom team selection
          linearUtils.storeData("linearTeam", customTeam.trim(), true);
        } else {
          // If no custom team name provided, revert to default
          teamSelect.value = "";
        }
      } else if (this.value) {
        // Save the selected team
        linearUtils.storeData("linearTeam", this.value, true);
      }
    });
  }

  // src/popup/content-extraction.js
  async function requestEmailContent() {
    const activeTab = await getActiveGmailTab();
    if (!activeTab) {
      showStatus("No Gmail tab detected. Please open Gmail and select an email.", true);
      return null;
    }
    
    try {
      await injectContentScript(activeTab);
      
      // Check if there's selected text from context menu
      const selectedText = await linearUtils.getData("selectedText", null);
      if (selectedText) {
        // Clear the stored selection after using it
        await linearUtils.removeData("selectedText");
        
        // Update the UI with the selected text
        const actionsElement = document.getElementById("actions");
        if (actionsElement) {
          actionsElement.textContent = selectedText;
          
          // Try to get email metadata
          try {
            const metadata = await getEmailMetadata(activeTab);
            if (metadata) {
              actionsElement.setAttribute("data-metadata", JSON.stringify(metadata));
              // Set title field - prioritize Fathom title if available
              const titleField = document.getElementById("issue-title");
              if (titleField) {
                if (metadata.fathomTitle) {
                  titleField.value = metadata.fathomTitle;
                } else if (metadata.subject) {
                  titleField.value = metadata.subject;
                }
              }
            }
          } catch (error) {
            console.warn("Could not get email metadata:", error);
          }
        }
        
        const sourceInfoElement = document.getElementById("content-source-info");
        if (sourceInfoElement) {
          sourceInfoElement.textContent = "Source: Selected Text";
        }
        
        showStatus("Selected text loaded");
        return { content: selectedText, source: "selection" };
      }
      
      // If no selected text, extract content from the email
      const response = await extractEmailContent(activeTab);
      
      if (response) {
        // Update the UI with the extracted content
        const actionsElement = document.getElementById("actions");
        if (actionsElement) {
          if (response.html) {
            actionsElement.innerHTML = response.html;
          } else if (response.content) {
            actionsElement.textContent = response.content;
          }
          
          // Store metadata as a data attribute
          if (response.metadata) {
            actionsElement.setAttribute("data-metadata", JSON.stringify(response.metadata));
          }
          
          // Set the title field consistently - prioritize Fathom title if available
          const titleField = document.getElementById("issue-title");
          if (titleField) {
            if (response.metadata && response.metadata.fathomTitle) {
              titleField.value = response.metadata.fathomTitle;
            } else if (response.title) {
              titleField.value = response.title;
            } else if (response.metadata && response.metadata.subject) {
              titleField.value = response.metadata.subject;
            }
          }
        }
        
        // Source info element already has traditional null check
        const sourceInfoElement = document.getElementById("content-source-info");
        if (sourceInfoElement) {
          let sourceText = "Source: ";
          
          if (response.source === "fathom") {
            sourceText += "Fathom Meeting Notes";
          } else if (response.source === "selection") {
            sourceText += "Selected Text";
          } else if (response.source === "full_email") {
            sourceText += "Full Email Content";
          } else if (response.source === "empty") {
            sourceText += "Gmail (No Action Items Found)";
          } else {
            sourceText += "Gmail";
          }
          
          sourceInfoElement.textContent = sourceText;
        }
        
        showStatus("Content extracted successfully");
      }
      
      return response;
    } catch (error) {
      handleError(error, "requesting email content", true);
      return null;
    }
  }
  
  async function injectContentScript(tab) {
    if (!tab || !linearUtils.isGmailUrl(tab.url)) {
      throw new Error("Not a Gmail tab");
    }
    try {
      const response = await new Promise((resolve, reject) => {
        try {
          chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response2) => {
            if (chrome.runtime.lastError) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } catch (error) {
          resolve(false);
        }
      });
      if (response) {
        console.log("Content script already injected");
        return;
      }
      console.log("Injecting content script");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/content.js"]
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("Error injecting content script:", error);
      throw new Error("Failed to inject content script: " + error.message);
    }
  }
  
  async function extractEmailContent(activeTab) {
    return new Promise((resolve, reject) => {
      showStatus("Extracting content...");
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: "extractContent" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || response.error) {
            reject(new Error(response?.error || "Unknown error"));
            return;
          }
          
          // Updated to handle the response format from getSelectedTextOrActionItems
          if (!response.success) {
            reject(new Error("Failed to extract content"));
            return;
          }
          
          // Log the response to help with debugging
          console.log("Extracted content response:", response);
          
          showStatus("Content extracted successfully");
          resolve(response);
        }
      );
    });
  }
  
  async function getEmailMetadata(tab) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: "getEmailMetadata" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (response && response.success && response.metadata) {
            resolve(response.metadata);
          } else {
            reject(new Error("Failed to get email metadata"));
          }
        }
      );
    });
  }

  // Centralized function to extract and process metadata
  function extractAndProcessMetadata(element) {
    if (!element) return {};
    
    let metadata = {};
    try {
      const metadataJson = element.getAttribute("data-metadata");
      if (metadataJson) {
        metadata = JSON.parse(metadataJson);
      }
    } catch (error) {
      console.warn("Failed to parse metadata:", error);
    }
    return metadata;
  }

  // src/popup/popup.js
  document.addEventListener("DOMContentLoaded", () => {
    showStatus("Loading...");
    
    // Cache frequently used DOM elements
    const elements = {
      actions: document.getElementById("actions"),
      issueTitle: document.getElementById("issue-title"),
      team: document.getElementById("team"),
      assignee: document.getElementById("assignee"),
      priority: document.getElementById("priority"),
      sourceInfo: document.getElementById("content-source-info"),
      undo: document.getElementById("undo"),
      sendToLinear: document.getElementById("sendToLinear"),
      refreshContent: document.getElementById("refresh-content"),
      container: document.querySelector(".container")
    };
    
    setupDefaultTeams();
    requestEmailContent();
    
    // Load and prefill the assignee field with the last used value
    loadSavedAssignee(elements.assignee);
    
    // Load and prefill the priority field with the last used value
    loadSavedPriority(elements.priority);
    
    // Simplified event handlers with direct function references
    elements.undo.addEventListener("click", () => {
      elements.actions.innerHTML = "";
      showStatus("Content cleared");
    });
    
    elements.sendToLinear.addEventListener("click", () => confirmAndSend(elements));
    
    elements.refreshContent.addEventListener("click", () => {
      showStatus("Refreshing content...");
      requestEmailContent();
    });
    
    // Save priority when it changes
    elements.priority.addEventListener("change", function() {
      linearUtils.storeData("linearPriority", this.value, true);
    });
    
    setupFormatButtons();
    
    if (elements.container) {
      const openModalBtn = document.createElement("button");
      openModalBtn.id = "open-modal-btn";
      openModalBtn.className = "primary-button";
      openModalBtn.textContent = "Open as Movable Dialog";
      openModalBtn.addEventListener("click", openModalDialog);
      elements.container.appendChild(openModalBtn);
    }
  });
  
  // Function to load and prefill the assignee field
  async function loadSavedAssignee(assigneeField) {
    try {
      const savedAssignee = await linearUtils.getData("lastAssignee", "", true);
      // Use the cached DOM element if provided, otherwise query it
      const field = assigneeField || document.getElementById("assignee");
      if (savedAssignee && field) {
        field.value = savedAssignee;
      }
    } catch (error) {
      console.warn("Failed to load saved assignee:", error);
    }
  }
  
  // Function to load and prefill the priority field
  async function loadSavedPriority(priorityField) {
    try {
      const savedPriority = await linearUtils.getData("linearPriority", "high", true);
      // Use the cached DOM element if provided, otherwise query it
      const field = priorityField || document.getElementById("priority");
      if (savedPriority && field) {
        field.value = savedPriority;
      }
    } catch (error) {
      console.warn("Failed to load saved priority:", error);
    }
  }
  
  async function openModalDialog() {
    try {
      const response = await sendMessageToBackground({ action: "openModal" });
      if (!response || !response.success) {
        showStatus("Error opening modal dialog. Make sure Gmail is open.", true);
        return;
      }
      window.close();
    } catch (error) {
      handleError(error, "opening modal", true);
    }
  }
  
  async function confirmAndSend(elements) {
    // Use cached elements if provided, otherwise query the DOM
    const els = elements || {
      issueTitle: document.getElementById("issue-title"),
      team: document.getElementById("team"),
      assignee: document.getElementById("assignee"),
      priority: document.getElementById("priority"),
      actions: document.getElementById("actions"),
      sourceInfo: document.getElementById("content-source-info")
    };
    
    const title = els.issueTitle.value || "New Issue";
    const team = els.team.value;
    const assignee = els.assignee.value;
    const priority = els.priority.value;

    if (!team) {
      showStatus("Please select a team", true);
      return;
    }

    const content = els.actions ? els.actions.innerHTML : "";
    if (!content) {
      showStatus("No content to send. Please extract content from Gmail first.", true);
      return;
    }

    if (!confirm(`Create Linear issue with title "${title}"?`)) {
      return;
    }

    showStatus("Creating Linear issue...");
    try {
      // Use the shared handleFormSubmit function from content.js
      const activeTab = await getActiveGmailTab();
      if (!activeTab) {
        throw new Error("No Gmail tab detected");
      }
      
      // Send message to content script to use the shared handleFormSubmit function
      chrome.tabs.sendMessage(
        activeTab.id,
        { 
          action: "submitForm", 
          data: { 
            title, 
            team, 
            assignee, 
            priority, 
            content 
          } 
        },
        (response) => {
          if (chrome.runtime.lastError) {
            handleError(new Error(chrome.runtime.lastError.message), "creating issue", true);
            return;
          }
          
          if (!response || !response.success) {
            showStatus(`Error creating issue: ${response?.error || "Unknown error"}`, true);
            return;
          }
          
          // Save the assignee and priority values for future use
          if (assignee) {
            linearUtils.storeData("lastAssignee", assignee, true);
          }
          if (priority) {
            linearUtils.storeData("linearPriority", priority, true);
          }
          if (team) {
            linearUtils.storeData("linearTeam", team, true);
          }
          
          showStatus("Issue created successfully!");
          els.actions.innerHTML = "";
          els.issueTitle.value = "";
          els.actions.removeAttribute("data-metadata");
          setTimeout(() => window.close(), 1500);
        }
      );
    } catch (error) {
      handleError(error, "creating issue", true);
    }
  }
})();
