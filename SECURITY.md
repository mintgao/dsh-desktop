# Security Policy

English | [中文](SECURITY.zh.md)

Report vulnerabilities through GitHub's private vulnerability reporting for `mintgao/dsh-desktop`. Do not open a public issue for a suspected credential leak, arbitrary code execution, sandbox escape, signature bypass, or exposure of session data.

Include the affected DSH Desktop version and Mac architecture, the minimum reproduction, impact, and any proposed mitigation. Remove API keys, credentials, personal session content, and private workspace data from every attachment.

The maintainer will acknowledge a complete report through the private advisory and coordinate disclosure after a fix or mitigation is available. DeepSeek Harness vulnerabilities that reproduce without this desktop shell should also be reported to the upstream project through its published security channel.

Only signed and notarized artifacts attached to a `desktop-v*` GitHub Release are supported distribution builds. Locally built or modified applications are outside the release signature guarantee.
