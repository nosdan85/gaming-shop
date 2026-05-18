# Memory Leak and Performance Fixes Summary

## Changes Made to server/bot.js

### Fix 1: Added ticketCreateChain reset mechanism
- Added `ticketCreateChainLength` counter and `TICKET_CREATE_CHAIN_MAX_LENGTH` constant (100)
- Modified `runTicketCreateQueued` to track chain length and reset when it exceeds 100 promises
- This prevents the promise chain from growing indefinitely

### Fix 2: Added periodic cache cleanup for cachedBotSelfId
- Added setInterval (every 5 minutes) to clean up expired bot cache entries
- Checks if `cachedBotSelfId` has exceeded TTL and resets it

### Fix 3: Changed ProofImage storage to URL-only (no Buffer data)
- Modified `upsertProofImages` function to store `data: null` instead of Buffer
- Only stores `sourceUrl` (Discord CDN URL) to avoid RAM bloat in MongoDB
- Added comment explaining the change

### Fix 4: Modified sendAutoVouchFromTicketImages to not pass buffers
- Changed `saveProofRecord` call to pass `imageBuffers: []` instead of actual buffers
- Added explanatory comment about avoiding binary data storage

## Changes Made to server/routes/shopRoutes.js

### Fix 5: Added periodic cleanup for discordAuthSuccessCache and discordAuthInFlight
- Added setInterval (every 5 minutes) to clean up both Maps
- Cleans expired entries from `discordAuthSuccessCache`
- Cleans stale entries from `discordAuthInFlight` (older than 5 minutes)

### Fix 6: Added timestamp tracking for in-flight promises
- Added `task._timestamp = Date.now()` when creating in-flight promises
- Enables the periodic cleanup to identify and remove stuck promises

## Impact

These changes address all four memory leak issues:
1. ✓ ticketCreateChain promise chain no longer grows indefinitely
2. ✓ cachedBotSelfId cache has TTL-based cleanup
3. ✓ ProofImage documents no longer store Buffer data in MongoDB
4. ✓ discordAuthSuccessCache and discordAuthInFlight Maps have periodic cleanup

## Testing Recommendations

1. Monitor memory usage over time to verify leaks are fixed
2. Test Discord bot functionality (ticket creation, vouch posting)
3. Test Discord authentication flow
4. Verify proof images still display correctly (using URLs from Discord CDN)
