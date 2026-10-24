// Stand-in for workerd's "cloudflare:email" (not a test file).
export class EmailMessage {
  constructor(public from: string, public to: string, public raw: string) {}
}
