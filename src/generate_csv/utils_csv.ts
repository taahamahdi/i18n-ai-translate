/**
 * @param response - the message from the LLM
 * @returns whether the response includes NAK
 */
export function isNAK(response: string): boolean {
    return response.includes("NAK") && !response.includes("ACK");
}

/**
 * @param response - the message from the LLM
 * @returns whether the response only contains ACK and not NAK
 */
export function isACK(response: string): boolean {
    return response.includes("ACK") && !response.includes("NAK");
}
