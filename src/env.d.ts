/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    account: { user: { id: string; name: string; email: string }; role: string } | null;
  }
}
