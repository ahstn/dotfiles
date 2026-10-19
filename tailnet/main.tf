# Tailnet policy, Services, and device tags. Run through `mise run tailnet <tofu args>`,
# which injects the OAuth client and the state passphrase from 1Password (see op.env).
# State is committed, encrypted with OpenTofu state encryption; plain Terraform cannot read it.

terraform {
  required_version = ">= 1.10"

  required_providers {
    tailscale = {
      source  = "tailscale/tailscale"
      version = "~> 0.29"
    }
  }

  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }

    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }

    state {
      method   = method.aes_gcm.state
      enforced = true
    }

    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

variable "state_passphrase" {
  description = "PBKDF2 passphrase for state and plan encryption (1Password: Personal/OpenTofu tailnet state)."
  type        = string
  sensitive   = true
}

# Credentials come from TAILSCALE_OAUTH_CLIENT_ID / TAILSCALE_OAUTH_CLIENT_SECRET.
# The default tailnet is the one that owns the OAuth client.
provider "tailscale" {}

# The policy file always exists, so adopt it instead of overwriting blindly.
import {
  to = tailscale_acl.policy
  id = "acl"
}

resource "tailscale_acl" "policy" {
  acl = file("${path.module}/policy.hujson")

  # The policy grants and auto-approves svc:oceans-llm, so define the Service first.
  depends_on = [tailscale_service.oceans_llm]
}

resource "tailscale_service" "oceans_llm" {
  name    = "svc:oceans-llm"
  comment = "oceans-llm gateway and admin UI (hogwarts, ~/git/oceans-llm)"
  ports   = ["tcp:443"]
}

# Service hosts must use a tag-based identity. Tagging moves hogwarts from user to tag
# ownership; policy.hujson keeps Tailscale SSH working for tag:server.
resource "tailscale_device_tags" "hogwarts" {
  device_id = "nyTHtRG6uQ11CNTRL"
  tags      = ["tag:server"]

  # tagOwners must define tag:server before the device can carry it.
  depends_on = [tailscale_acl.policy]
}
