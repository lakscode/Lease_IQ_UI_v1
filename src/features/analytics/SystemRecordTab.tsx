// TODO(analytics): implement. Embedded in the lease workspace; fetches its own data.
export default function SystemRecordTab({ leaseId }: { leaseId: string }) {
  return <p className="muted" data-lease={leaseId}>Coming soon.</p>;
}
