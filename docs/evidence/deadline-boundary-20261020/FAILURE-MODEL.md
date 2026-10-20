# Logical deadline before provider dispatch

Written before changing the fixture. Runtime 3.5.5 starts the logical model
deadline before its public host reserves a model call and persists the start
event. A 100 ms budget therefore does not guarantee that HTTP receives a request.
An offline reproduction with a 150 ms reservation delay produced zero requests,
one reservation and one estimated timeout settlement. This does not establish
the cause of either historical integration failure.

The product integration should deliberately delay the public host reservation
return by 150 ms, retain the original 100 ms logical deadline, and assert zero
provider requests, one settled timeout, one durable notice and a successful new
human turn. Do not change product deadlines or write a hardcoded request count
to the receipt. The existing `runtime-provider-timeout.test.ts` separately must
observe three real local HTTP attempts, three disconnected transports and three
settled failed calls; a pre-send pass cannot replace that transport check.

Risks to reject: the delay also affecting the recovery worker, an accidental
provider call after expiry, missing/duplicate settlement, fabricated success,
duplicated failure notices, a hanging transport, historical evidence overwrite,
or a test adapter changing other public host methods. Run the two owning tests
on an isolated local test database with synthetic configuration only.
