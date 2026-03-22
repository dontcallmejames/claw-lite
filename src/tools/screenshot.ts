import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const screenshotTool: ToolDefinition = {
  name: 'take_screenshot',
  description: 'Take a screenshot of the entire primary screen and return the saved file path.',
  inputSchema: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Optional filename for the screenshot (default: screenshot_<timestamp>.png)',
      },
    },
    required: [],
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { filename } = input;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Sanitize filename: allow only alphanumeric, hyphens, underscores, dots, spaces.
      // This prevents PowerShell injection via single-quote escape in the Save() call.
      let safeName: string;
      if (filename) {
        const cleaned = String(filename).replace(/[^a-zA-Z0-9\-_. ]/g, '');
        safeName = cleaned.trim() || `screenshot_${timestamp}.png`;
        // Ensure it ends with .png
        if (!safeName.toLowerCase().endsWith('.png')) safeName += '.png';
      } else {
        safeName = `screenshot_${timestamp}.png`;
      }
      const screenshotName = safeName;
      const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');

      // Create screenshots directory if it doesn't exist
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const screenshotPath = path.join(screenshotsDir, screenshotName);

      // Windows PowerShell screenshot command
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
        $bitmap.Save('${screenshotPath.replace(/\\/g, '\\\\')}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `;

      await execAsync(`powershell -Command "${psCommand}"`, { timeout: 10000 });

      if (fs.existsSync(screenshotPath)) {
        return {
          success: true,
          output: `Screenshot saved to: ${screenshotPath}`
        };
      } else {
        return {
          success: false,
          error: 'Screenshot was not created'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Error taking screenshot: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
