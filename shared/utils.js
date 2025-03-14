/**
 * Shared utility functions for the Linear Extension
 */

// Check if a URL is a Gmail URL
function isGmailUrl(url) {
  return url && url.includes("mail.google.com");
}

// Convert HTML to Markdown
function htmlToMarkdown(html) {
  if (!html) return "";
  
  // Create a temporary div to parse the HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  
  // Process the HTML to convert to Linear-compatible markdown
  let markdown = processNodeToMarkdown(tempDiv);
  
  // Clean up extra newlines
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  
  return markdown.trim();
}

// Helper function for htmlToMarkdown
function processNodeToMarkdown(node) {
  if (!node) return "";
  
  // Text node - just return the text content
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  
  // Element node - process based on tag name
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node.tagName.toLowerCase();
    
    // Process all child nodes and get their combined content
    let content = "";
    for (const child of node.childNodes) {
      content += processNodeToMarkdown(child);
    }
    
    // Apply formatting based on tag
    switch (tagName) {
      case "h1":
        return `# ${content.trim()}\n\n`;
      case "h2":
        return `## ${content.trim()}\n\n`;
      case "h3":
        return `### ${content.trim()}\n\n`;
      case "p":
        return `${content.trim()}\n\n`;
      case "strong":
      case "b":
        return `**${content.trim()}**`;
      case "em":
      case "i":
        return `_${content.trim()}_`;
      case "u":
        return content.trim(); // Linear doesn't support underline in markdown
      case "s":
      case "strike":
      case "del":
        return `~~${content.trim()}~~`;
      case "code":
        return `\`${content.trim()}\``;
      case "pre":
        return `\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
      case "a":
        const href = node.getAttribute("href");
        return href ? `[${content.trim()}](${href})` : content;
      case "ul":
        return content;
      case "ol":
        return content;
      case "li":
        const parent = node.parentNode;
        if (parent && parent.tagName.toLowerCase() === "ol") {
          return `1. ${content.trim()}\n`;
        } else {
          return `* ${content.trim()}\n`;
        }
      case "div":
        if (node.classList.contains("action-item") || node.classList.contains("next-step")) {
          // Special handling for our action items and next steps
          const itemContent = node.querySelector(".item-content");
          const assignee = node.querySelector(".assignee");
          
          let result = "* ";
          if (itemContent) {
            result += itemContent.textContent.trim();
          }
          if (assignee) {
            result += ` (${assignee.textContent.trim()})`;
          }
          return result + "\n";
        }
        return content;
      case "br":
        return "\n";
      default:
        return content;
    }
  }
  
  return "";
}

// Format metadata for issue description
function formatMetadata(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "";
  }
  
  let metadataText = "\n\n---\n\n### Source Information\n\n";
  
  if (metadata.from) {
    metadataText += `**From:** ${metadata.from}\n\n`;
  }
  if (metadata.to) {
    metadataText += `**To:** ${metadata.to}\n\n`;
  }
  if (metadata.date) {
    metadataText += `**Date:** ${metadata.date}\n\n`;
  }
  if (metadata.subject) {
    metadataText += `**Subject:** ${metadata.subject}\n\n`;
  }
  
  metadataText += `**Created with:** Fathom to Linear Extension`;
  return metadataText;
}

// Create a Linear issue description with content and metadata
function createIssueDescription(content, metadata = {}, options = {}) {
  let description = content ? content + "\n\n" : "";
  
  if (options.source) {
    description += `Source: ${options.source}\n\n`;
  }
  
  if (metadata && Object.keys(metadata).length > 0) {
    description += formatMetadata(metadata);
  }
  
  return description;
}

// Generate a Linear URL with issue details
function generateLinearUrl({
  title = "",
  description = "",
  teamId = "",
  priority = "medium",
  assignee = ""
}) {
  let url = "https://linear.app/";
  if (teamId) {
    url += `team/${teamId}/`;
  }
  url += "new";
  
  const queryParams = [];
  if (title) {
    queryParams.push(`title=${encodeURIComponent(title)}`);
  }
  if (description) {
    queryParams.push(`description=${encodeURIComponent(description)}`);
  }
  if (priority) {
    queryParams.push(`priority=${encodeURIComponent(priority)}`);
  }
  if (assignee) {
    queryParams.push(`assignee=${encodeURIComponent(assignee)}`);
  }
  
  if (queryParams.length > 0) {
    url += "?" + queryParams.join("&");
  }
  
  return url;
}

/**
 * Get team definitions 
 * This provides a default set of teams for compatibility
 * @returns {Array} Array of team objects
 */
function getTeamDefinitions() {
  // Return a hardcoded set of teams directly
  return [
    {
      id: "ENG",
      name: "Engineering (ENG)"
    },
    {
      id: "PROD",
      name: "Product (PROD)"
    },
    {
      id: "CUSTOM", 
      name: "Custom Team"
    }
  ];
}

// Setup default teams in a select element
function setupDefaultTeams(teamSelect, assigneeInput) {
  try {
    // Clear existing options
    teamSelect.innerHTML = "";
    
    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select a team";
    teamSelect.appendChild(defaultOption);
    
    // Get team definitions from centralized function
    const teams = getTeamDefinitions();
    
    // Add predefined teams
    teams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;
      teamSelect.appendChild(option);
    });
    
    // Load saved assignee value if assigneeInput is provided
    if (assigneeInput) {
      chrome.storage.local.get(["lastAssignee"], (result) => {
        if (result.lastAssignee) {
          assigneeInput.value = result.lastAssignee;
        }
      });
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
        } else {
          // If no custom team name provided, revert to default
          teamSelect.value = "";
        }
      }
    });
  } catch (error) {
    console.error("Error setting up teams:", error);
    // Add a disabled option to indicate the error
    const errorOption = document.createElement("option");
    errorOption.value = "";
    errorOption.textContent = "Error loading teams: " + error.message;
    errorOption.disabled = true;
    errorOption.selected = true;
    teamSelect.innerHTML = "";
    teamSelect.appendChild(errorOption);
  }
}

// Show status message
function showStatus(statusElement, message, isError = false) {
  if (!statusElement) return;
  
  statusElement.textContent = message;
  statusElement.style.display = "block";
  
  if (isError) {
    statusElement.style.backgroundColor = "#ffebee";
    statusElement.style.color = "#c62828";
  } else {
    statusElement.style.backgroundColor = "#e6f7ff";
    statusElement.style.color = "#333";
    setTimeout(() => {
      statusElement.style.display = "none";
    }, 5000);
  }
}

// Make an element draggable
function makeElementDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  handle.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = element.offsetTop - pos2 + "px";
    element.style.left = element.offsetLeft - pos1 + "px";
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Storage utility functions
async function getData(key, defaultValue = null, useLocalStorage = false) {
  return new Promise((resolve) => {
    if (useLocalStorage) {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    } else {
      // Use session storage for temporary data
      const value = sessionStorage.getItem(key);
      resolve(value !== null ? JSON.parse(value) : defaultValue);
    }
  });
}

async function storeData(key, value, useLocalStorage = false) {
  return new Promise((resolve) => {
    if (useLocalStorage) {
      const data = {};
      data[key] = value;
      chrome.storage.local.set(data, () => {
        resolve(true);
      });
    } else {
      // Use session storage for temporary data
      sessionStorage.setItem(key, JSON.stringify(value));
      resolve(true);
    }
  });
}

async function removeData(key, useLocalStorage = false) {
  return new Promise((resolve) => {
    if (useLocalStorage) {
      chrome.storage.local.remove(key, () => {
        resolve(true);
      });
    } else {
      // Use session storage for temporary data
      sessionStorage.removeItem(key);
      resolve(true);
    }
  });
}

/**
 * Generates HTML from structured data containing action items and next steps
 * @param {Object} data - The structured data object
 * @returns {string} HTML representation of the data
 */
function generateHtmlFromStructuredData(data) {
  let html = "";
  
  // Add consistent styling for headings and lists
  const headingStyle = 'font-weight: bold; margin-top: 15px; font-size: 16px; color: #333;';
  const listStyle = 'margin-top: 5px; margin-bottom: 15px; padding-left: 20px;';
  const itemStyle = 'margin-bottom: 8px;';
  const assigneeStyle = 'color: #666; font-size: 0.9em; font-style: italic;';
  
  // Action Items section
  if (data.actionItems && data.actionItems.length > 0) {
    html += `<h3 style='${headingStyle}'>Action Items</h3><ul style='${listStyle}'>`;
    for (const item of data.actionItems) {
      html += `<li style='${itemStyle}'>${item.text}${item.assignee ? ` <span style="${assigneeStyle}">[${item.assignee}]</span>` : ""}</li>`;
    }
    html += "</ul>";
  }
  
  // Next Steps section
  if (data.nextSteps && data.nextSteps.length > 0) {
    html += `<h3 style='${headingStyle}'>Next Steps</h3><ul style='${listStyle}'>`;
    for (const item of data.nextSteps) {
      html += `<li style='${itemStyle}'>${item.text}${item.assignee ? ` <span style="${assigneeStyle}">[${item.assignee}]</span>` : ""}</li>`;
    }
    html += "</ul>";
  }
  
  // Add a note if no content was found
  if (html === "") {
    html = "<p>No action items or next steps found in this email. Select text manually or try another email.</p>";
  }
  
  return html;
}

/**
 * Generates Markdown from structured data containing action items and next steps
 * @param {Object} data - The structured data object
 * @returns {string} Markdown representation of the data
 */
function generateMarkdownFromStructuredData(data) {
  let markdown = "";
  
  // Action Items section
  if (data.actionItems && data.actionItems.length > 0) {
    markdown += "## Action Items\n\n";
    for (const item of data.actionItems) {
      markdown += `- ${item.text}${item.assignee ? ` [${item.assignee}]` : ""}\n`;
    }
    markdown += "\n";
  }
  
  // Next Steps section
  if (data.nextSteps && data.nextSteps.length > 0) {
    markdown += "## Next Steps\n\n";
    for (const item of data.nextSteps) {
      markdown += `- ${item.text}${item.assignee ? ` [${item.assignee}]` : ""}\n`;
    }
    markdown += "\n";
  }
  
  return markdown;
}

// Export all utility functions
window.linearUtils = {
  isGmailUrl,
  htmlToMarkdown,
  processNodeToMarkdown,
  formatMetadata,
  createIssueDescription,
  generateLinearUrl,
  getTeamDefinitions,
  setupDefaultTeams,
  showStatus,
  makeElementDraggable,
  getData,
  storeData,
  removeData,
  generateHtmlFromStructuredData,
  generateMarkdownFromStructuredData
}; 