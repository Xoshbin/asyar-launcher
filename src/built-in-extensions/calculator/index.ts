import {
  Extension,
  ExtensionContext,
  ExtensionResult
} from "asyar-api";
import { evaluateExpression } from "./calculatorEngine";

const calculatorExtension: Extension = {
  async initialize(context: ExtensionContext): Promise<void> {},
  async activate(): Promise<void> {},
  async deactivate(): Promise<void> {},
  onUnload: null,
  async viewActivated(): Promise<void> {},
  async viewDeactivated(): Promise<void> {},

  async executeCommand(commandId: string, args?: Record<string, any>): Promise<void> {
    if (commandId === "calculator.calculate") {
      const expression = (args?.expression as string) || "";
      if (!expression) return;

      try {
        const result = await evaluateExpression(expression);
        if (typeof navigator !== 'undefined') {
          await navigator.clipboard.writeText(result.toString());
        }
      } catch (error) {
        console.error(`Calculator error: ${error}`);
      }
    }
  },

  async search(query: string): Promise<ExtensionResult[]> {
    if (!query || query.trim().length === 0) return [];

    try {
      const result = await evaluateExpression(query);
      return [{
        id: `calc-${Date.now()}`,
        title: `${query} = ${result}`,
        subtitle: "Click to copy result",
        score: 1.0,
        icon: "🧮",
        onAction: () => {
          if (typeof navigator !== 'undefined') {
            navigator.clipboard.writeText(result.toString());
          }
        }
      }];
    } catch (e) {
      return [];
    }
  }
};

export default calculatorExtension;
