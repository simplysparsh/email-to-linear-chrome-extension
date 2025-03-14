(() => {
  // src/content/extraction.js
  function getSelectedTextOrActionItems() {
    try {
      console.log("Starting content extraction...");
      let selectedText = window.getSelection().toString().trim();
      if (selectedText.length > 0) {
        console.log("Found user-selected text");
        return {
          content: selectedText,
          html: selectedText.replace(/\n/g, "<br>"),
          metadata: extractMetadata(document),
          source: "selection",
          title: "Selected content"
        };
      }
      
      console.log("No selected text, looking for email content");
      injectStyles();
      
      // Wait a moment to ensure Gmail has fully loaded
      return new Promise((resolve) => {
        console.log("Waiting for Gmail to fully load...");
        setTimeout(async () => {
          try {
            console.log("Gmail load timeout completed");
            
            // Continue with extraction
            const emailBody = findEmailBody();
            if (!emailBody) {
              console.log("No email body found");
              resolve(null);
              return;
            }
            
            console.log("Email body found, extracting content");
            const subjectElement = document.querySelector(".hP");
            const subject = subjectElement ? subjectElement.textContent.trim() : null;
            console.log("Email subject:", subject);
            
            // Extract metadata including Fathom title if available
            const metadata = extractMetadata(document, emailBody, subject);
            console.log("Extracted metadata:", metadata);
            
            // Extract Fathom content
            const fathomContent = extractFathomContent(emailBody);
            if (!fathomContent || (!fathomContent.actionItems || fathomContent.actionItems.length === 0) && (!fathomContent.nextSteps || fathomContent.nextSteps.length === 0)) {
              console.log("No action items or next steps found");
              resolve({
                content: "Select text in the email and click Refresh Content",
                html: "<p>Select text in the email and click Refresh Content</p>",
                source: "empty",
                metadata: metadata,
                title: metadata.fathomTitle || subject || "Email content"
              });
              return;
            } else {
              fathomContent.metadata = metadata;
              // Use Fathom title if available, otherwise fall back to subject
              fathomContent.title = metadata.fathomTitle || subject || "Fathom Notes";
            }
            
            resolve(fathomContent);
          } catch (error) {
            console.error("Error after Gmail load timeout:", error);
            resolve({
              error: true,
              message: error.toString()
            });
          }
        }, 500); // Using 500ms timeout as requested
      });
    } catch (error) {
      console.error("Error in content extraction:", error);
      return {
        error: true,
        message: error.toString()
      };
    }
  }
  function injectStyles() {
    const styleId = "fathom-linear-styles";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = `
        h3 {
          margin-top: 15px;
          margin-bottom: 10px;
          color: #333;
          font-weight: 600;
          font-size: 16px;
        }
        
        /* Simple styling for list items */
        .item-content {
          margin-bottom: 8px;
          padding-left: 8px;
        }
      `;
      document.head.appendChild(styleElement);
    }
  }
  function findEmailBody() {
    console.log("Searching for email body");
    
    // First, check if this is a Fathom email by looking for Fathom-specific elements
    const fathomElements = document.querySelectorAll('a[href*="fathom.video"]');
    console.log(`Found ${fathomElements.length} elements with fathom.video links`);
    
    // Look specifically for hidden divs that might contain the full summary
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      const text = div.textContent.toLowerCase();
      // Check if this div contains typical Fathom meeting summary sections
      if ((text.includes('action items') || text.includes('next steps')) && 
          (text.includes('meeting purpose') || text.includes('key takeaways'))) {
        console.log("Found Fathom meeting summary in a div");
        return div;
      }
    }
    
    if (fathomElements.length > 0) {
      // This is likely a Fathom email
      console.log("Detected Fathom email based on links");
      
      // Find the closest container that might contain the entire email content
      for (const element of fathomElements) {
        // Try to find an ancestor that contains the complete email
        let ancestor = element;
        for (let i = 0; i < 5; i++) { // Look up to 5 levels up
          if (!ancestor.parentElement) break;
          ancestor = ancestor.parentElement;
          
          // Check if this ancestor contains sections like "Action Items" or "Next Steps"
          const text = ancestor.textContent.toLowerCase();
          if (text.includes('action items') && text.includes('next steps')) {
            console.log("Found Fathom email container with action items and next steps");
            return ancestor;
          }
        }
      }
    }
    
    // Look for specific ID patterns that match Fathom emails
    const emailBodyElement = document.querySelector('[id*="emailBody"]');
    if (emailBodyElement) {
      console.log("Found element with emailBody in ID");
      return emailBodyElement;
    }
    
    // If no Fathom-specific container found, fall back to standard email selectors
    const selectors = [
      '[data-message-id] .a3s',
      '[role="main"] .adn.ads .a3s',
      '[data-message-id] div[dir="ltr"]',
      '[role="main"] .adn [data-message-id] .adP',
      '[role="main"] .a3s',
      '[role="main"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Checking selector: ${selector}, found ${elements.length} elements`);
      
      for (const element of elements) {
        const content = (element.innerText || element.textContent).trim();
        
        if (content.length > 0) {
          // Check if this contains Fathom meeting keywords
          const hasFathomContent = content.toLowerCase().includes('action items') || 
                                 content.toLowerCase().includes('next steps');
          
          if (hasFathomContent) {
            console.log(`Found Fathom content in ${selector}`);
            return element;
          }
          
          console.log(`Found generic email body with selector: ${selector}, content length: ${content.length}`);
          return element;
        }
      }
    }
    
    console.log("No email body found with any selector");
    return null;
  }
  function extractFathomContent(emailElement) {
    const actionItems = [];
    const nextSteps = [];
    
    // Set to track already added items to avoid duplicates
    const addedActionItems = new Set();
    const addedNextSteps = new Set();

    // Helper function to check if a text is promotional content
    const isPromotionalContent = (text) => {
      const promotionalPhrases = [
        'view meeting', 
        'ask fathom', 
        'chatgpt for your meetings', 
        'try ask fathom', 
        'download',
        'never take notes again', 
        'sign up for free',
        'join the',
        'using fathom on their meetings',
        'clear history',
        'more suggestions',
        'send feedback',
        'what can gemini do',
        'summarize this email',
        'sign up for free',
        'join the',
        'github', // Often in footers
        'unsubscribe'  // Often in footers
      ];
      
      const lowercaseText = text.toLowerCase();
      return promotionalPhrases.some(phrase => lowercaseText.includes(phrase));
    };

    // Look for sections containing "Action Items" and "Next Steps"
    // Fathom emails follow a consistent structure with these headings
    const allElements = Array.from(emailElement.querySelectorAll('*'));
    let currentSection = null;
    
    // Try to find the specific hidden div that contains the full Fathom summary
    const possibleHiddenSummaries = Array.from(emailElement.querySelectorAll('div[style*="display:none"], div[style*="display: none"]'));
    let summaryDiv = null;
    
    for (const div of possibleHiddenSummaries) {
      const text = div.textContent.toLowerCase();
      if (text.includes('meeting purpose') && 
          (text.includes('action items') || text.includes('next steps'))) {
        console.log("Found hidden Fathom summary div");
        summaryDiv = div;
        break;
      }
    }
    
    // If we found a summary div, prioritize extracting from it
    const elementsToProcess = summaryDiv ? 
      Array.from(summaryDiv.querySelectorAll('*')).concat(allElements) : 
      allElements;
    
    // Helper function to check if an element is a heading for a specific section
    const isSectionHeading = (text, sectionName) => {
      const lowerText = text.toLowerCase();
      return lowerText.includes(sectionName.toLowerCase()) && 
             (text.length < 40 || lowerText.startsWith(sectionName.toLowerCase()));
    };

    // First pass - identify section headers
    for (const element of elementsToProcess) {
      const text = element.textContent.trim();
      if (!text) continue;
      
      // Skip promotional content for section detection
      if (isPromotionalContent(text)) {
        continue;
      }
      
      // Check for section headers
      if (isSectionHeading(text, 'action items')) {
        console.log("Found Action Items section");
        currentSection = 'actionItems';
        continue; // Skip the header itself
      } else if (isSectionHeading(text, 'next steps')) {
        console.log("Found Next Steps section");
        currentSection = 'nextSteps';
        continue; // Skip the header itself
      } else if (isSectionHeading(text, 'topics') || 
                 isSectionHeading(text, 'key takeaways') || 
                 isSectionHeading(text, 'meeting purpose')) {
        // Reset section when we hit a different section header
        currentSection = null;
        continue;
      }
      
      if (currentSection) {
        // Look for bullet points - they will be either li elements or p/div elements with bullet-like formatting
        const isBulletLike = element.tagName === 'LI' || 
                            text.startsWith('•') || 
                            text.startsWith('-') ||
                            text.match(/^\s*[\u2022\u2023\u25E6\u2043\u2219\u2739\u2713]\s/) || // Various bullet symbols
                            element.style.listStyleType;
        
        // Find any links in the element
        const links = element.querySelectorAll('a');
        const hasFathomLink = Array.from(links).some(link => 
          link.href && link.href.includes('fathom.video')
        );
        
        // If this element is bullet-like or has Fathom links, consider it a valid item
        if ((isBulletLike || hasFathomLink) && text.length > 0) {
          // Skip very short items or promotional items
          if (text.length < 5 || isPromotionalContent(text)) {
            continue;
          }
          
          // Extract any assignee information using [name] pattern
          const assignee = extractAssignee(text);
          
          // Clean up the text, removing the assignee brackets and any markers
          let cleanedText = text
            .replace(/\[.*?\]/g, '') // Remove assignee brackets
            .replace(/^[\s\u2022\u2023\u25E6\u2043\u2219\u2739\u2713•\-]+/g, '') // Remove bullet markers and leading spaces
            .trim();
            
            // Remove trailing links or promotional content
            cleanedText = cleanedText.replace(/View Meeting →.*$/i, '')
                                   .replace(/Try Ask Fathom →.*$/i, '')
                                   .replace(/\s+→\s*$/g, '') // Remove trailing arrows
                                   .trim();
            
            // Remove "View Recording" text that appears in some Fathom emails
            cleanedText = cleanedText.replace(/View Recording\s*$/i, '').trim();
            
            // Skip if the cleaned text is too short or is promotional
            if (cleanedText.length < 5 || isPromotionalContent(cleanedText)) {
              continue;
            }
            
            // Create item data structure
            const itemData = {
              text: cleanedText,
              assignee: assignee,
              hasFathomLink: hasFathomLink
            };
            
            // Create a unique key for deduplication
            const itemKey = `${cleanedText.toLowerCase()}-${assignee || ''}`;
            
            // Only add items that are in a proper section
            // And only if we haven't already added this item
            if (currentSection && cleanedText.length > 0 && cleanedText.length < 200) {
              // Add to the appropriate section if not a duplicate
              if (currentSection === 'actionItems' && !addedActionItems.has(itemKey)) {
                actionItems.push(itemData);
                addedActionItems.add(itemKey);
              } else if (currentSection === 'nextSteps' && !addedNextSteps.has(itemKey)) {
                nextSteps.push(itemData);
                addedNextSteps.add(itemKey);
              }
            }
        }
      }
    }
    
    console.log(`Extracted ${actionItems.length} unique action items and ${nextSteps.length} unique next steps`);
    
    return {
      actionItems,
      nextSteps,
      source: "email"
    };
  }
  function extractAssignee(text) {
    const assigneeRegex = /\[(.*?)\]/;
    const match = text.match(assigneeRegex);
    return match ? match[1] : null;
  }
  function extractMetadata(document2, emailBody, subject) {
    const metadata = {};
    
    // Extract subject
    if (subject) {
      metadata.subject = subject;
    } else {
      const subjectElement = document2.querySelector('.hP');
      if (subjectElement) {
        metadata.subject = subjectElement.textContent.trim();
      }
    }
    
    // Try to extract Fathom meeting title if available
    if (emailBody) {
      const fathomTitle = extractFathomTitle(emailBody);
      if (fathomTitle) {
        metadata.fathomTitle = fathomTitle;
      }
    }
    
    // Extract sender
    const fromElement = document2.querySelector('.gD');
    if (fromElement) {
      metadata.from = fromElement.getAttribute('email') || fromElement.textContent.trim();
    }
    
    // Extract recipients
    const toElements = document2.querySelectorAll('.g2');
    if (toElements && toElements.length > 0) {
      const recipients = Array.from(toElements)
        .map(el => el.getAttribute('email') || el.textContent.trim())
        .filter(Boolean);
      
      if (recipients.length > 0) {
        metadata.to = recipients.join(', ');
      }
    }
    
    // Extract date
    const dateElement = document2.querySelector('.g3');
    if (dateElement) {
      metadata.date = dateElement.textContent.trim();
    }
    
    return metadata;
  }

  /**
   * Extracts the Fathom meeting title from the email HTML
   * @param {Element} emailBody - The email body element
   * @returns {string|null} - The Fathom meeting title or null if not found
   */
  function extractFathomTitle(emailBody) {
    try {
      // First, try to find the specific Fathom title format as shown in the example
      // This is typically in a td with specific styling for the meeting title
      const titleElement = emailBody.querySelector('td.m_2374998061236657253fs-24, td[style*="font:700 28px/35px"], td[style*="font-weight:700"][style*="font-size:28px"]');
      
      if (titleElement && titleElement.textContent.trim()) {
        console.log("Found Fathom title with primary selector:", titleElement.textContent.trim());
        return titleElement.textContent.trim();
      }
      
      // Try more specific selectors based on the provided HTML structure
      const specificTitleElement = emailBody.querySelector('td[style*="letter-spacing:-.6px"]');
      if (specificTitleElement && specificTitleElement.textContent.trim()) {
        console.log("Found Fathom title with letter-spacing selector:", specificTitleElement.textContent.trim());
        return specificTitleElement.textContent.trim();
      }
      
      // Look for a td that follows a td containing "Internal Meeting" text
      const meetingTypeElements = Array.from(emailBody.querySelectorAll('td'));
      for (let i = 0; i < meetingTypeElements.length; i++) {
        if (meetingTypeElements[i].textContent.trim() === "Internal Meeting" && i + 1 < meetingTypeElements.length) {
          const potentialTitle = meetingTypeElements[i + 1].textContent.trim();
          if (potentialTitle && potentialTitle.length > 5 && potentialTitle.length < 100) {
            console.log("Found Fathom title after 'Internal Meeting':", potentialTitle);
            return potentialTitle;
          }
        }
      }
      
      // Alternative approach: look for any td with font-weight 700 and larger font size
      const potentialTitleElements = emailBody.querySelectorAll('td[style*="font:700"], td[style*="font-weight:700"]');
      for (const element of potentialTitleElements) {
        // Check if this looks like a title (not too short, not too long)
        const text = element.textContent.trim();
        if (text && text.length > 5 && text.length < 100) {
          console.log("Found Fathom title with generic selector:", text);
          return text;
        }
      }
      
      console.log("No Fathom title found");
      return null;
    } catch (error) {
      console.error("Error extracting Fathom title:", error);
      return null;
    }
  }

  function isGmailFullyLoaded() {
    const mainContent = document.querySelector('[role="main"]');
    return !!mainContent && document.readyState === "complete";
  }
  function waitForGmailToLoad() {
    return new Promise((resolve) => {
      const isLoaded = () => {
        const mainContent = document.querySelector('[role="main"]');
        return !!mainContent && document.readyState === "complete";
      };
      
      if (isLoaded()) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        if (isLoaded()) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
      
      // Set a timeout to resolve anyway after 5 seconds
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        console.log("Gmail load timeout reached, proceeding anyway");
        resolve();
      }, 5000);
    });
  }

  // src/content/content.js
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received message in content script:", request);
    if (request.action === "ping") {
      sendResponse({ success: true, message: "Content script is loaded" });
      return true;
    }
    if (request.action === "extractContent") {
      handleExtractContent(sendResponse);
      return true;
    }
    if (request.action === "openModal") {
      handleOpenModal(sendResponse);
      return true;
    }
    if (request.action === "getEmailMetadata") {
      handleGetEmailMetadata(sendResponse);
      return true;
    }
    if (request.action === "submitForm") {
      handleSubmitForm(request.data, sendResponse);
      return true;
    }
    sendResponse({ success: false, error: "Unknown action" });
    return true;
  });

  // Shared function to extract email metadata
  function extractEmailMetadata() {
    const emailBody = findEmailBody();
    const subjectElement = document.querySelector(".hP");
    const subject = subjectElement ? subjectElement.textContent.trim() : null;
    const fromElement = document.querySelector('.gD');
    const from = fromElement ? fromElement.getAttribute('email') || fromElement.textContent.trim() : null;
    const toElements = document.querySelectorAll('.g2');
    const to = toElements && toElements.length > 0 ? 
      Array.from(toElements).map(el => el.getAttribute('email') || el.textContent.trim()).filter(Boolean).join(', ') : null;
    const dateElement = document.querySelector('.g3');
    const date = dateElement ? dateElement.textContent.trim() : null;
    
    return { subject, from, to, date };
  }

  async function handleExtractContent(sendResponse) {
    try {
      await waitForGmailToLoad();
      const result = await getSelectedTextOrActionItems();
      
      if (result) {
        // Extract metadata using shared function
        const emailBody = findEmailBody();
        const metadata = extractMetadata(document, emailBody, result.metadata?.subject);
        if (metadata) {
          result.metadata = metadata;
        }
      }
      
      // Log the result before sending it back
      console.log("Extraction result with metadata:", result);
      
      sendExtractionResponse(result, sendResponse);
    } catch (error) {
      console.error("Error extracting content:", error);
      sendResponse({
        success: false,
        error: error.toString()
      });
    }
  }
  async function handleOpenModal(sendResponse) {
    try {
      console.log("Handling open modal request");
      
      // Create and display the modal
      const modal = createDraggableModal();
      
      // Use the same extraction workflow that the popup uses
      await waitForGmailToLoad();
      const result = await getSelectedTextOrActionItems();
      
      // Process the result using the same logic as sendExtractionResponse
      const processedResult = processExtractionResult(result);
      
      if (!processedResult.success) {
        const statusElement = modal.querySelector("#status");
        if (statusElement) {
          showStatus(statusElement, processedResult.error || "No content could be extracted", true);
        }
        
        sendResponse({ 
          success: false, 
          error: processedResult.error || "No content could be extracted" 
        });
        return;
      }
      
      // Display the content in modal
      displayContentInModal(modal, processedResult);
      
      sendResponse({ success: true, message: "Modal opened and content loaded" });
    } catch (error) {
      console.error("Error opening modal:", error);
      sendResponse({
        success: false,
        error: error.message || "Unknown error opening modal"
      });
    }
  }
  
  // Helper to process extraction result - mirrors sendExtractionResponse logic
  function processExtractionResult(result) {
    if (!result) {
      return {
        success: false,
        error: "No content could be extracted"
      };
    }
    
    if (result.error) {
      return {
        success: false,
        error: result.message || "Error extracting content"
      };
    }
    
    // Create a new object to avoid modifying the original
    const processedResult = { 
      ...result, 
      success: true 
    };
    
    // Always regenerate HTML to ensure consistency
    if (result.actionItems || result.nextSteps) {
      processedResult.html = linearUtils.generateHtmlFromStructuredData(result);
      processedResult.content = linearUtils.generateMarkdownFromStructuredData(result);
    } else if (result.content && !result.html) {
      // If we have content but no HTML (from selection), format it consistently
      processedResult.html = `<p>${result.content.replace(/\n/g, "<br>")}</p>`;
    }
    
    return processedResult;
  }
  
  // Helper to display content in modal, ensuring consistency with popup display
  function displayContentInModal(modal, result) {
    // Find extracted content element
    const extractedContent = modal.querySelector("#linear-extension-extracted-content");
    if (!extractedContent) {
      console.error("Could not find extracted content element in modal");
      return;
    }
    
    // Clear any existing content first
    extractedContent.innerHTML = "";
    
    // Set content with proper fallbacks, matching popup behavior
    if (result.html) {
      extractedContent.innerHTML = result.html;
    } else if (result.content) {
      extractedContent.innerHTML = `<p>${result.content.replace(/\n/g, "<br>")}</p>`;
    } else {
      extractedContent.innerHTML = "<p>No content could be extracted. Try selecting text in the email.</p>";
    }
    
    // Set the title field if available
    const titleInput = modal.querySelector("#linear-issue-title");
    if (titleInput) {
      // Prioritize Fathom title if available
      if (result.metadata && result.metadata.fathomTitle) {
        titleInput.value = result.metadata.fathomTitle;
      } else if (result.title) {
        titleInput.value = result.title;
      } else if (result.metadata && result.metadata.subject) {
        titleInput.value = result.metadata.subject;
      } else {
        titleInput.value = ""; // Clear if no title available
      }
    }
    
    // Add source info to match popup behavior
    const statusElement = modal.querySelector("#status");
    if (statusElement && result.source) {
      let sourceMsg = "";
      if (result.source === "selection") {
        sourceMsg = "Content extracted from your text selection";
      } else if (result.source === "email") {
        sourceMsg = "Content extracted from Fathom meeting email";
      }
      
      if (sourceMsg) {
        showStatus(statusElement, sourceMsg, false);
      }
    }
  }
  
  // ----- MODAL FUNCTIONS (moved from modal.js) -----
  
  // Modal UI functions - moved from modal.js
  function createDraggableModal() {
    console.log("Creating draggable modal...");
    let modal = document.getElementById("linear-extension-modal");
    if (modal) {
      console.log("Modal already exists, displaying it");
      modal.style.display = "block";
      return modal;
    }
    
    console.log("Creating new modal element");
    modal = document.createElement("div");
    modal.id = "linear-extension-modal";
    modal.className = "linear-extension-modal";
    modal.style.cssText = `
        position: fixed;
        top: 50px;
        left: 50px;
        width: 600px;
        max-width: 90vw;
        min-height: 500px;
        max-height: 80vh;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        z-index: 9999;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: Arial, sans-serif;
        transition: box-shadow 0.3s ease;
        box-sizing: border-box;
    `;
    
    // Add hover effect
    modal.addEventListener("mouseenter", () => {
        modal.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.25)";
    });
    
    modal.addEventListener("mouseleave", () => {
        modal.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.2)";
    });
    
    const header = document.createElement("div");
    header.className = "modal-header";
    header.style.cssText = `
        padding: 12px 16px;
        background-color: white;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
    `;
    
    // Create a container for the logo and title
    const headerLeft = document.createElement("div");
    headerLeft.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: center;
        flex: 1;
        margin-right: 20px;
    `;
    
    // Add logo
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("icon48.png");
    logo.alt = "Fathom to Linear";
    logo.style.cssText = `
        height: 40px;
        width: auto;
        max-width: 150px;
    `;
    
    const title = document.createElement("h3");
    title.textContent = "Send to Linear";
    title.style.margin = "0";
    title.style.fontSize = "16px";
    
    headerLeft.appendChild(logo);
    headerLeft.appendChild(title);
    header.appendChild(headerLeft);
    
    const closeButton = document.createElement("button");
    closeButton.textContent = "\xD7";
    closeButton.style.cssText = `
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        padding: 0 4px;
    `;
    closeButton.addEventListener("click", () => {
      modal.style.display = "none";
    });
    header.appendChild(closeButton);
    
    const content = document.createElement("div");
    content.className = "modal-content";
    content.style.cssText = `
        padding: 16px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background-color: #f0f4f7;
        width: 100%;
        box-sizing: border-box;
        max-height: calc(80vh - 60px);
    `;
    
    // Instructions container
    const instructionsContainer = document.createElement("div");
    instructionsContainer.className = "instructions-container";
    instructionsContainer.style.cssText = `
        background-color: white;
        padding: 12px;
        border-radius: 5px;
        margin-bottom: 10px;
        border-left: 3px solid #5e6ad2;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    `;
    const instructionsText = document.createElement("p");
    instructionsText.textContent = "This extension can extract content from Gmail emails:";
    instructionsText.style.cssText = `
        margin-top: 0;
        margin-bottom: 8px;
        color: #333;
        font-weight: 500;
    `;
    const instructionsList = document.createElement("ul");
    instructionsList.style.cssText = `
        margin: 0;
        padding-left: 20px;
    `;
    const fathomItem = document.createElement("li");
    fathomItem.innerHTML = "<strong>Fathom Meetings:</strong> Automatically extracts action items and next steps";
    fathomItem.style.cssText = `
        margin-bottom: 4px;
        font-size: 12px;
        color: #555;
    `;
    const selectionItem = document.createElement("li");
    selectionItem.innerHTML = "<strong>Manual Selection:</strong> Select text in the email before clicking the extension icon";
    selectionItem.style.cssText = `
        margin-bottom: 4px;
        font-size: 12px;
        color: #555;
    `;
    instructionsList.appendChild(fathomItem);
    instructionsList.appendChild(selectionItem);
    instructionsContainer.appendChild(instructionsText);
    instructionsContainer.appendChild(instructionsList);
    content.appendChild(instructionsContainer);
    
    // Form
    const form = document.createElement("form");
    form.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        background-color: white;
        padding: 15px;
        padding-bottom: 25px;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        width: 100%;
        box-sizing: border-box;
        overflow: visible;
        margin-bottom: 15px;
    `;
    
    // Prevent form submission from refreshing the page
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        return false;
    });
    
    // Title field
    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Issue Title:";
    titleLabel.htmlFor = "linear-issue-title";
    titleLabel.style.cssText = `
        font-weight: bold;
        font-size: 12px;
        color: #555;
        margin-top: 8px;
        display: block;
        width: 100%;
        box-sizing: border-box;
    `;
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.id = "linear-issue-title";
    titleInput.placeholder = "Enter issue title";
    titleInput.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 14px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
        margin-bottom: 5px;
    `;
    form.appendChild(titleLabel);
    form.appendChild(titleInput);
    
    // Team field
    const teamLabel = document.createElement("label");
    teamLabel.textContent = "Team:";
    teamLabel.htmlFor = "team-select";
    teamLabel.style.cssText = `
        font-weight: bold;
        font-size: 12px;
        color: #555;
        margin-top: 8px;
        display: block;
        width: 100%;
        box-sizing: border-box;
    `;
    const teamSelect = document.createElement("select");
    teamSelect.id = "team-select";
    teamSelect.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 14px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
        margin-bottom: 5px;
    `;
    form.appendChild(teamLabel);
    form.appendChild(teamSelect);
    
    // Priority field
    const priorityLabel = document.createElement("label");
    priorityLabel.textContent = "Priority:";
    priorityLabel.htmlFor = "priority-select";
    priorityLabel.style.cssText = `
        font-weight: bold;
        font-size: 12px;
        color: #555;
        margin-top: 8px;
        display: block;
        width: 100%;
        box-sizing: border-box;
    `;
    const prioritySelect = document.createElement("select");
    prioritySelect.id = "priority-select";
    prioritySelect.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 14px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
        margin-bottom: 5px;
    `;
    const priorities = [
      { value: "urgent", label: "Urgent" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" }
    ];
    
    // Create priority options
    priorities.forEach((priority) => {
      const option = document.createElement("option");
      option.value = priority.value;
      option.textContent = priority.label;
      prioritySelect.appendChild(option);
    });
    
    // Load saved priority from storage
    window.linearUtils.getData("linearPriority", "high", true).then(savedPriority => {
      if (savedPriority && prioritySelect) {
        prioritySelect.value = savedPriority;
      } else {
        // Default to high if no saved priority
        prioritySelect.value = "high";
      }
    });
    
    // Save priority when it changes
    prioritySelect.addEventListener("change", function() {
      window.linearUtils.storeData("linearPriority", this.value, true);
    });
    
    form.appendChild(priorityLabel);
    form.appendChild(prioritySelect);
    
    // Assignee field
    const assigneeLabel = document.createElement("label");
    assigneeLabel.textContent = "Assignee:";
    assigneeLabel.htmlFor = "assignee-input";
    assigneeLabel.style.cssText = `
        font-weight: bold;
        font-size: 12px;
        color: #555;
        margin-top: 8px;
        display: block;
        width: 100%;
        box-sizing: border-box;
    `;
    const assigneeInput = document.createElement("input");
    assigneeInput.type = "text";
    assigneeInput.id = "assignee-input";
    assigneeInput.placeholder = "e.g., John Doe or John";
    assigneeInput.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 14px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
        margin-bottom: 5px;
    `;
    form.appendChild(assigneeLabel);
    form.appendChild(assigneeInput);
    
    // Formatting controls
    const formattingControls = document.createElement("div");
    formattingControls.className = "formatting-controls";
    formattingControls.style.cssText = `
        display: flex;
        gap: 5px;
        margin-bottom: 8px;
        width: 100%;
        box-sizing: border-box;
    `;
    
    const formatButtons = [
      { format: "bold", title: "Bold", text: "B" },
      { format: "italic", title: "Italic", text: "<i>I</i>" },
      { format: "underline", title: "Underline", text: "<u>U</u>" }
    ];
    
    formatButtons.forEach(btn => {
      const formatBtn = document.createElement("button");
      formatBtn.type = "button";
      formatBtn.className = "format-btn";
      formatBtn.dataset.format = btn.format;
      formatBtn.title = btn.title;
      formatBtn.innerHTML = btn.text;
      formatBtn.style.cssText = `
          padding: 5px 10px;
          font-size: 14px;
          background-color: #f0f0f0;
          color: #333;
          border: 1px solid #ccc;
          border-radius: 3px;
          cursor: pointer;
          flex: none;
      `;
      formatBtn.addEventListener("mouseover", () => {
        formatBtn.style.backgroundColor = "#e0e0e0";
      });
      formatBtn.addEventListener("mouseout", () => {
        formatBtn.style.backgroundColor = "#f0f0f0";
      });
      formatBtn.addEventListener("click", () => {
        document.execCommand(btn.format, false, null);
        extractedContent.focus();
      });
      formattingControls.appendChild(formatBtn);
    });
    
    form.appendChild(formattingControls);
    
    // Content field
    const contentLabel = document.createElement("label");
    contentLabel.textContent = "Email Content:";
    contentLabel.style.cssText = `
        font-weight: bold;
        font-size: 12px;
        color: #555;
        margin-top: 8px;
        display: block;
        width: 100%;
        box-sizing: border-box;
    `;
    const extractedContent = document.createElement("div");
    extractedContent.className = "extracted-content";
    extractedContent.id = "linear-extension-extracted-content";
    extractedContent.contentEditable = "true";
    extractedContent.style.cssText = `
        width: 100%;
        min-height: 120px;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 14px;
        background-color: #fff;
        outline: none;
        overflow-y: auto;
        max-height: 180px;
        white-space: pre-wrap;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
        margin-bottom: 5px;
    `;
    form.appendChild(contentLabel);
    form.appendChild(extractedContent);
    
    // Button group
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "button-group";
    buttonGroup.style.cssText = `
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 15px;
        width: 100%;
        box-sizing: border-box;
        min-height: 40px;
        background-color: white;
        padding-top: 10px;
    `;
    
    const undoButton = document.createElement("button");
    undoButton.id = "undo";
    undoButton.textContent = "Clear";
    undoButton.style.cssText = `
        color: white;
        border: none;
        padding: 8px 12px;
        font-size: 14px;
        border-radius: 4px;
        cursor: pointer;
        transition: 0.2s;
        background-color: #6c757d;
        font-weight: 500;
        flex: 1;
        box-sizing: border-box;
        display: inline-block;
    `;
    undoButton.addEventListener("mouseover", () => {
      undoButton.style.opacity = "0.9";
    });
    undoButton.addEventListener("mouseout", () => {
      undoButton.style.opacity = "1";
    });
    undoButton.addEventListener("click", (event) => {
      // Prevent default button behavior
      event.preventDefault();
      extractedContent.innerHTML = "";
    });
    
    const refreshButton = document.createElement("button");
    refreshButton.id = "refresh-content";
    refreshButton.textContent = "Refresh Content";
    refreshButton.style.cssText = `
        color: white;
        border: none;
        padding: 8px 12px;
        font-size: 14px;
        border-radius: 4px;
        cursor: pointer;
        transition: 0.2s;
        background-color: #007bff;
        font-weight: 500;
        flex: 1;
        box-sizing: border-box;
        display: inline-block;
    `;
    refreshButton.addEventListener("mouseover", () => {
      refreshButton.style.opacity = "0.9";
    });
    refreshButton.addEventListener("mouseout", () => {
      refreshButton.style.opacity = "1";
    });
    refreshButton.addEventListener("click", async (event) => {
      try {
        // Prevent default button behavior
        event.preventDefault();
        
        // Get the status element
        const statusMsg = form.querySelector("#status");
        await refreshContent(form, statusMsg);
      } catch (error) {
        console.error("Error refreshing content:", error);
        alert("Error refreshing content: " + error.message);
      }
    });
    
    const submitButton = document.createElement("button");
    submitButton.id = "sendToLinear";
    submitButton.textContent = "Send to Linear";
    submitButton.style.cssText = `
        color: white;
        border: none;
        padding: 8px 12px;
        font-size: 14px;
        border-radius: 4px;
        cursor: pointer;
        transition: 0.2s;
        background-color: #28a745;
        font-weight: bold;
        flex: 1;
        box-sizing: border-box;
        display: inline-block;
    `;
    submitButton.addEventListener("mouseover", () => {
      submitButton.style.opacity = "0.9";
    });
    submitButton.addEventListener("mouseout", () => {
      submitButton.style.opacity = "1";
    });
    
    buttonGroup.appendChild(undoButton);
    buttonGroup.appendChild(refreshButton);
    buttonGroup.appendChild(submitButton);
    form.appendChild(buttonGroup);
    
    // Status message
    const statusMessage = document.createElement("div");
    statusMessage.id = "status";
    statusMessage.className = "status-message";
    statusMessage.style.cssText = `
        margin-top: 10px;
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-size: 12px;
        color: #333;
        background-color: #e6f7ff;
        display: none;
        width: 100%;
        box-sizing: border-box;
    `;
    form.appendChild(statusMessage);
    
    content.appendChild(form);
    modal.appendChild(header);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Setup teams and make the modal draggable - use direct function calls
    makeElementDraggable(modal, header);
    setupDefaultTeams(teamSelect, assigneeInput);
    
    // Submit button event listener
    submitButton.addEventListener("click", async (event) => {
      // Prevent default button behavior
      event.preventDefault();
      
      const title = titleInput.value.trim();
      const team = teamSelect.value;
      const assignee = assigneeInput.value;
      const priority = prioritySelect.value;
      const content = extractedContent.innerHTML;
      
      submitButton.textContent = "Creating...";
      submitButton.disabled = true;
      
      try {
        // Call handleFormSubmit directly
        await handleFormSubmit(title, team, assignee, priority, content);
        showStatus(statusMessage, "Issue created successfully!");
        extractedContent.innerHTML = "";
        titleInput.value = "";
        modal.style.display = "none";
      } catch (error) {
        console.error("Error creating issue:", error);
        showStatus(statusMessage, error.message, true);
        submitButton.textContent = "Send to Linear";
        submitButton.disabled = false;
      }
    });
    
    return modal;
  }
  
  // Helper function for showing status messages
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
  
  // Helper function to set up team options
  function setupDefaultTeams(teamSelect, assigneeInput) {
    try {
      // Clear existing options
      teamSelect.innerHTML = "";
      
      // Add teams to select using shared utility
      window.linearUtils.getTeamDefinitions().forEach(team => {
        const option = document.createElement("option");
        option.value = team.id;
        option.textContent = team.name;
        teamSelect.appendChild(option);
      });
      
      // Load saved values from storage, and set defaults if not available
      window.linearUtils.getData("linearTeam", null, true).then(linearTeam => {
        window.linearUtils.getData("linearAssignee", null, true).then(linearAssignee => {
          console.log("Loaded saved preferences:", { linearTeam, linearAssignee });
          
          // Set team from storage or default to ENG
          if (linearTeam) {
            // Check if the saved team exists in our options
            const teamExists = Array.from(teamSelect.options).some(opt => opt.value === linearTeam);
            
            if (teamExists) {
              teamSelect.value = linearTeam;
            } else {
              // If team doesn't exist in current options, default to ENG
              teamSelect.value = "ENG";
            }
          } else {
            // If no team saved, default to ENG
            teamSelect.value = "ENG";
          }
          
          // Set assignee from storage
          if (linearAssignee) {
            assigneeInput.value = linearAssignee;
          }
        });
      });
      
      // Save team selection when it changes
      teamSelect.addEventListener("change", function() {
        if (this.value === "CUSTOM") {
          const customTeamId = prompt("Enter custom team ID:");
          if (customTeamId) {
            const customTeamName = prompt("Enter custom team name:");
            if (customTeamName) {
              const option = document.createElement("option");
              option.value = customTeamId;
              option.textContent = customTeamName;
              teamSelect.insertBefore(option, teamSelect.querySelector('option[value="CUSTOM"]'));
              teamSelect.value = customTeamId;
              
              // Save the custom team selection
              window.linearUtils.storeData("linearTeam", customTeamId, true);
            } else {
              // If canceled, revert to ENG
              teamSelect.value = "ENG";
              window.linearUtils.storeData("linearTeam", "ENG", true);
            }
          } else {
            // If canceled, revert to ENG
            teamSelect.value = "ENG";
            window.linearUtils.storeData("linearTeam", "ENG", true);
          }
        } else {
          // Save the selected team
          window.linearUtils.storeData("linearTeam", this.value, true);
        }
      });
      
      // Save assignee value when it changes
      assigneeInput.addEventListener("change", function() {
        if (this.value) {
          window.linearUtils.storeData("linearAssignee", this.value, true);
        }
      });
      
    } catch (error) {
      console.error("Error setting up teams:", error);
      // Add error option to select
      teamSelect.innerHTML = "";
      const errorOption = document.createElement("option");
      errorOption.textContent = "Error loading teams";
      errorOption.disabled = true;
      errorOption.selected = true;
      teamSelect.appendChild(errorOption);
    }
  }
  
  // Helper function to make an element draggable
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
  
  // Helper function to inject a script
  function injectScript(scriptName) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(scriptName);
      script.onload = () => {
        console.log(`${scriptName} loaded`);
        resolve();
      };
      script.onerror = (error) => {
        console.error(`Error loading ${scriptName}:`, error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }
  
  async function handleGetEmailMetadata(sendResponse) {
    try {
      await waitForGmailToLoad();
      const emailBody = findEmailBody();
      if (!emailBody) {
        sendResponse({ success: false, error: "No email body found" });
        return;
      }
      
      const subjectElement = document.querySelector(".hP");
      const subject = subjectElement ? subjectElement.textContent.trim() : null;
      
      const metadata = extractMetadata(document, emailBody, subject);
      sendResponse({ success: true, metadata });
    } catch (error) {
      console.error("Error getting email metadata:", error);
      sendResponse({ success: false, error: error.toString() });
    }
  }
  function sendExtractionResponse(result, sendResponse) {
    const processedResult = processExtractionResult(result);
    
    if (!processedResult.success) {
      sendResponse({
        success: false,
        error: processedResult.error
      });
      return;
    }
    
    // Send the processed result back to the caller
    sendResponse({
      success: true,
      content: processedResult.content,
      html: processedResult.html,
      metadata: processedResult.metadata,
      title: processedResult.title,
      source: processedResult.source
    });
  }

  // Shared function to handle form submission
  async function handleFormSubmit(title, team, assignee, priority, content) {
    if (!title) {
      throw new Error("Please enter a title for the issue");
    }
    if (!team) {
      throw new Error("Please select a team");
    }
    if (!content) {
      throw new Error("No content to send");
    }
    
    // Use shared utility for HTML to Markdown conversion if available
    let markdown;
    if (window.linearUtils) {
      markdown = window.linearUtils.htmlToMarkdown(content);
    } else {
      // Fallback to simple conversion
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = content;
      markdown = tempDiv.textContent || "";
      markdown = markdown.replace(/\s+/g, ' ').trim();
    }
    
    // Use shared utility for creating issue description if available
    let description;
    if (window.linearUtils) {
      description = window.linearUtils.createIssueDescription(markdown, {});
    } else {
      description = markdown;
    }
    
    // Save the assignee, team, and priority values for future use
    if (assignee) window.linearUtils.storeData("linearAssignee", assignee, true);
    if (team) window.linearUtils.storeData("linearTeam", team, true);
    if (priority) window.linearUtils.storeData("linearPriority", priority, true);
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "createLinearIssue",
        title,
        description,
        team,
        assignee,
        priority
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response || !response.success) {
          reject(new Error(response?.error || "Failed to create issue"));
        } else {
          resolve();
        }
      });
    });
  }

  // Handler for form submissions from the popup
  async function handleSubmitForm(data, sendResponse) {
    try {
      if (!data) {
        sendResponse({ success: false, error: "No form data provided" });
        return;
      }
      
      const { title, team, assignee, priority, content } = data;
      
      await handleFormSubmit(title, team, assignee, priority, content);
      
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error submitting form:", error);
      sendResponse({
        success: false,
        error: error.toString()
      });
    }
  }

  function extractEmailData() {
    const emailBody = findEmailBody();
    if (!emailBody) {
      console.error("No email body found in extractEmailData");
      return {
        content: "No email content found",
        html: "<p>No email content found</p>",
        source: "empty"
      };
    }
    
    const content = extractFathomContent(emailBody);
    const subjectElement = document.querySelector(".hP");
    const subject = subjectElement ? subjectElement.textContent.trim() : null;
    const metadata = extractMetadata(document, emailBody, subject);
    const title = metadata && metadata.subject ? metadata.subject : "Fathom Notes";
    
    return {
      content,
      metadata,
      title,
      source: "email"
    };
  }

  // Log initial load without excessive debugging info
  console.log("Linear Extension Content Script Loaded");

  // Simplify the init logging
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded in Linear Extension content script");
  });

  // Add a shared function for refreshing content in both popup and modal
  async function refreshContent(container, statusElement) {
    try {
      if (statusElement) {
        showStatus(statusElement, "Refreshing content...", false);
      }
      
      // Get content extraction elements
      const extractedContent = container.querySelector("#linear-extension-extracted-content") || 
                              container.querySelector("#actions");
      const titleInput = container.querySelector("#linear-issue-title") || 
                        container.querySelector("#issue-title");
      
      if (!extractedContent) {
        console.error("Could not find content element for refresh");
        return false;
      }
      
      // Extract content using the same function for popup and modal
      const result = await getSelectedTextOrActionItems();
      
      // Process using the shared processing logic
      const processedResult = processExtractionResult(result);
      
      if (!processedResult.success) {
        if (statusElement) {
          showStatus(statusElement, processedResult.error || "Failed to extract content", true);
        }
        return false;
      }
      
      // Display content in the form fields
      if (processedResult.html) {
        extractedContent.innerHTML = processedResult.html;
      } else if (processedResult.content) {
        extractedContent.innerHTML = `<p>${processedResult.content.replace(/\n/g, "<br>")}</p>`;
      } else {
        extractedContent.innerHTML = "<p>No content could be extracted. Try selecting text in the email.</p>";
      }
      
      // Set title from processed result if title field exists
      if (titleInput) {
        // Prioritize Fathom title if available
        if (processedResult.metadata && processedResult.metadata.fathomTitle) {
          titleInput.value = processedResult.metadata.fathomTitle;
        } else if (processedResult.title) {
          titleInput.value = processedResult.title;
        } else if (processedResult.metadata && processedResult.metadata.subject) {
          titleInput.value = processedResult.metadata.subject;
        }
      }
      
      // Show success message
      if (statusElement) {
        // Add source info
        let sourceMsg = "Content refreshed successfully";
        if (processedResult.source === "selection") {
          sourceMsg = "Content extracted from your text selection";
        } else if (processedResult.source === "email") {
          sourceMsg = "Content extracted from Fathom meeting email";
        }
        showStatus(statusElement, sourceMsg);
      }
      
      return true;
    } catch (error) {
      console.error("Error refreshing content:", error);
      if (statusElement) {
        showStatus(statusElement, "Error: " + error.message, true);
      }
      return false;
    }
  }
})();


