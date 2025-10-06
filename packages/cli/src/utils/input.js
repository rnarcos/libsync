/**
 * @fileoverview Input utilities for CLI interactions
 * Provides utilities for user prompts, port checking, and interactive inputs
 */

import net from 'net';

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if port is available
 */
export function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });

    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Prompt user for Y/N confirmation
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} User's answer
 */
export function promptUser(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    // Check if we have a TTY and setRawMode is available
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on(
      'data',
      /** @param {string} key */ (key) => {
        if (key === '\u0003') {
          // Ctrl+C
          process.exit();
        }

        const answer = key.toLowerCase();
        if (answer === 'y' || answer === 'n' || key === '\r') {
          process.stdout.write('\n');
          // Only call setRawMode if it's available
          if (
            process.stdin.isTTY &&
            typeof process.stdin.setRawMode === 'function'
          ) {
            process.stdin.setRawMode(false);
          }
          process.stdin.pause();
          resolve(answer === 'y' || key === '\r');
        }
      },
    );
  });
}

/**
 * Find an available port starting from the given port
 * @param {number} startPort - Starting port to check
 * @param {number} maxTries - Maximum number of ports to try
 * @returns {Promise<number|null>} Available port or null if none found
 */
export async function findAvailablePort(startPort, maxTries = 10) {
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i;
    if (await checkPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

/**
 * Prompt user for string input with specific validation
 * @param {string} question - Question to ask
 * @returns {Promise<string|false>} User input string or false if cancelled
 */
export async function promptUserInput(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let input = '';

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
    };

    process.stdin.on(
      'data',
      /** @param {string} key */ (key) => {
        if (key === '\u0003') {
          // Ctrl+C
          cleanup();
          process.stdout.write('\n');
          resolve(false);
        } else if (key === '\r' || key === '\n') {
          // Enter
          cleanup();
          process.stdout.write('\n');
          resolve(input.trim() || false);
        } else if (key === '\u007f' || key === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
          // Printable characters
          input += key;
          process.stdout.write(key);
        }
      },
    );
  });
}

/**
 * Prompt user to select from multiple options
 * @param {string} question - Question to ask
 * @param {string[]} options - Array of options
 * @param {number} defaultIndex - Default option index (0-based)
 * @returns {Promise<number>} Selected option index
 */
export function promptSelect(question, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    console.log(question);
    options.forEach((option, index) => {
      const isDefault = index === defaultIndex;
      const prefix = isDefault ? '▶' : ' ';
      console.log(`${prefix} ${index + 1}. ${option}`);
    });

    process.stdout.write(
      `\nSelect option (1-${options.length}) [${defaultIndex + 1}]: `,
    );

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on(
      'data',
      /** @param {string} key */ (key) => {
        if (key === '\u0003') {
          // Ctrl+C
          process.exit();
        }

        if (key === '\r') {
          // Enter - use default
          process.stdout.write('\n');
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve(defaultIndex);
          return;
        }

        const num = parseInt(key, 10);
        if (num >= 1 && num <= options.length) {
          process.stdout.write('\n');
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve(num - 1);
        }
      },
    );
  });
}

/**
 * Prompt user for text input
 * @param {string} question - Question to ask
 * @param {string} defaultValue - Default value
 * @returns {Promise<string>} User input
 */
export async function promptText(question, defaultValue = '') {
  return new Promise(async (resolve) => {
    const { createInterface } = await import('readline');
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;

    readline.question(prompt, (answer) => {
      readline.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Display a loading spinner while executing an async operation
 * @param {string} message - Loading message
 * @param {Promise<any>} operation - Async operation to execute
 * @returns {Promise<any>} Result of the operation
 */
export async function withSpinner(message, operation) {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  process.stdout.write(`${message} ${spinner[0]}`);

  const interval = setInterval(() => {
    i = (i + 1) % spinner.length;
    process.stdout.write(`\r${message} ${spinner[i]}`);
  }, 100);

  try {
    const result = await operation;
    clearInterval(interval);
    process.stdout.write(`\r${message} ✓\n`);
    return result;
  } catch (error) {
    clearInterval(interval);
    process.stdout.write(`\r${message} ✗\n`);
    throw error;
  }
}
