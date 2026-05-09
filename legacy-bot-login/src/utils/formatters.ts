export function formatPhoneDisplay(raw: string | undefined): string {
  if (!raw) return "";

  // Remove os sufixos padrão do WhatsApp
  let digits = raw.replace(/@(lid|s\.whatsapp\.net|c\.us)$/, "");

  // Se for um número válido de celular brasileiro (+55 11 99999-9999) com 12 ou 13 dígitos
  if (/^55\d{10,11}$/.test(digits)) {
    const area = digits.slice(2, 4);
    const firstPart = digits.slice(4, -4);
    const lastPart = digits.slice(-4);
    return `+55 (${area}) ${firstPart}-${lastPart}`;
  }

  // Se for um Linked Device ID (muitos dígitos, não começa com 55), exibimos formatado ou apenas os números sem o @lid
  return digits;
}
