import { createFileRoute, useNavigate } from "@tanstack/react-router"
import KompassApp from "../kompass/KompassApp"

// Kompass, the customer's app. `?client=<id>` picks the demo customer.
export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { client?: string } =>
    typeof search.client === "string" ? { client: search.client } : {},
  component: CustomerApp,
})

function CustomerApp() {
  const { client } = Route.useSearch()
  const navigate = useNavigate({ from: "/" })
  return <KompassApp customerId={client} onCustomerChange={(id) => navigate({ search: { client: id } })} />
}
