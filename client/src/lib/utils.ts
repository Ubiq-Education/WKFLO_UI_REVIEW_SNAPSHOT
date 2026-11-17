import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { translateErrorCode } from "./i18n"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parses an error message and extracts HTTP code and error details
 * @param errorMessage - The error message to parse (may contain HTTP code + JSON response)
 * @param fallbackMessage - Optional fallback message prefix (default: "An error occurred")
 * @returns Object with httpCode, errorCode, and formatted message
 */
export function parseErrorMessage(errorMessage: string, fallbackMessage: string = "An error occurred"): {
  httpCode: number | null;
  errorCode: string | null;
  message: string;
} {
  // Try to extract HTTP code from the beginning of the error message
  const httpCodeMatch = errorMessage.match(/^(\d{3})\s*/);
  const httpCode = httpCodeMatch ? parseInt(httpCodeMatch[1]) : null;
  
  // Remove HTTP code from the message to get the response body
  const responseBody = httpCodeMatch ? errorMessage.replace(/^\d{3}\s*: /, '') : errorMessage;
  
  try {
    const errorData = JSON.parse(responseBody);
    if (errorData.errors && errorData.errors.length > 0 && errorData.errors[0].code) {
      const errorCode = errorData.errors[0].code;
      const translatedMessage = translateErrorCode(errorCode);
      
      return {
        httpCode,
        errorCode,
        message: `${fallbackMessage}: ${translatedMessage}`
      };
    }
  } catch (parseError) {
    // If parsing fails, use the original error message
  }
  
  return {
    httpCode,
    errorCode: null,
    message: `${fallbackMessage}: ${responseBody}${httpCode ? ` (HTTP ${httpCode})` : ''}`
  };
}
