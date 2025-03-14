# Email to Linear

A Chrome extension that extracts content from Gmail emails (including Fathom meeting summaries) and sends them to Linear for task tracking.

## Overview

This extension helps streamline the workflow between Gmail and Linear task management by:

1. Automatically extracting action items and next steps from Fathom meeting summaries in Gmail
2. Supporting manual text selection from any email content
3. Creating Linear issues with appropriate metadata and formatting
4. Working with any email content, not just Fathom summaries

## Development Setup

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should now be installed and ready for testing

## Project Structure

- `manifest.json` - Extension configuration
- `background.js` - Background service worker for handling context menus and cross-tab communication
- `content.js` - Content script that runs in Gmail to extract email content and render the modal UI
- `popup.html/js/css` - UI for the extension popup
- `shared/utils.js` - Shared utility functions
- `icons` - Extension icons in various sizes

## Key Features

- Automatic extraction of Fathom meeting summaries
- Manual selection of any email content
- Context menu integration for selecting text in Gmail
- Movable modal dialog for better workflow
- Team and assignee management
- Priority selection
- Rich text editing

## Modal UI Implementation

The modal UI is implemented directly in `content.js` rather than as a separate HTML file due to Chrome extension and Gmail restrictions:

1. **Extension Architecture Limitations**: Chrome extensions can only inject content scripts into web pages; they cannot easily overlay separate HTML files onto the Gmail interface.

2. **Cross-Origin Restrictions**: Gmail's security model prevents direct DOM manipulation from external HTML files.

3. **Dynamic Content Generation**: The modal is created dynamically using JavaScript DOM manipulation in `content.js`, which allows it to:
   - Access the Gmail DOM directly
   - Extract content from the current email
   - Maintain state within the Gmail context
   - Be draggable and repositionable

4. **Performance Benefits**: This approach reduces the need for message passing between different extension components, making the UI more responsive.

The `createDraggableModal()` function in `content.js` handles the creation and management of this UI.

## Security

### Data Handling

- All data processing happens locally within the browser
- No data is sent to external servers except when creating Linear issues
- Email content is only accessed when explicitly requested by the user
- No authentication tokens or credentials are stored by the extension

### Permissions

The extension requires the following permissions:

- `activeTab` - To access the current Gmail tab
- `storage` - To store user preferences (team, assignee)
- `scripting` - To inject content scripts
- `identity` - For potential future OAuth integration
- `tabs` - To communicate between tabs
- `webNavigation` - To detect when Gmail is fully loaded
- `contextMenus` - To add right-click menu options

### Content Security

- Content Security Policy (CSP) is implemented to prevent XSS attacks
- All scripts are loaded from the extension package only
- No inline scripts or eval() are used

### Best Practices

- Basic input validation is implemented, with room for enhancement
- Error handling is implemented throughout the codebase
- The extension only runs on Gmail domains
- Console logging should be disabled in production

## Development Notes

- The extension uses Manifest V3 for better security and performance
- Content script injection is done dynamically to minimize performance impact
- The UI is designed to be responsive and user-friendly

## Testing

Manual testing should cover:

1. Extracting content from Fathom meeting summaries
2. Selecting text manually and creating issues
3. Using the context menu options
4. Testing with various email formats
5. Verifying that Linear issues are created correctly 