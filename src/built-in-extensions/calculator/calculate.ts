import { performance } from "asyar-api";
import type { CommandProps } from "asyar-api";
import {
  evaluateExpression,
  looksLikeMathExpression,
} from "./calculatorEngine";

/**
 * Direct command handler for calculations
 * This follows the Raycast-style pattern where each command has its own file
 */
export async function Command(props: CommandProps): Promise<void> {
  console.log("Calculator Command executed with args:", props.arguments);
  performance.mark("calculator-cmd-start");

  try {
    // Get expression from arguments or default to empty string
    const expression =
      typeof props.arguments === "string"
        ? props.arguments
        : props.arguments?.expression || "";

    // Check if we should handle this input
    if (!expression || !looksLikeMathExpression(expression)) {
      // If not a math expression, don't return any results
      props.onExit?.();
      return;
    }

    // Calculate the result
    const result = await evaluateExpression(expression);

    // Return the result to the search list
    props.onResult?.({
      id: `calculator-result-${Date.now()}`,
      title: `${expression} = ${result}`,
      subtitle: "Click to copy result",
      icon: "🧮",
      action: () => {
        // Copy result to clipboard when clicked
        navigator.clipboard.writeText(result.toString());
      },
    });
  } catch (error) {
    console.error("Error in calculator command:", error);

    // Only show error for expressions that look like math
    if (looksLikeMathExpression(props.arguments as string)) {
      props.onResult?.({
        id: `calculator-error-${Date.now()}`,
        title: `Error: Could not calculate`,
        subtitle: error.message || "Invalid expression",
        icon: "⚠️",
      });
    }

    // Signal completion with error
    props.onExit?.(error);
    return;
  }

  // Mark calculation as complete
  performance.mark("calculator-cmd-end");
  performance.measure(
    "calculator-execution-time",
    "calculator-cmd-start",
    "calculator-cmd-end"
  );

  // Signal successful completion
  props.onExit?.();
}

// Export as default for compatibility
export default Command;
