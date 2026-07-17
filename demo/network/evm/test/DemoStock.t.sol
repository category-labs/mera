// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {DemoStock} from "../contracts/DemoStock.sol";

/// Pins the deployed price code against a frozen reference implementation
/// with the same math and constants: any edit to the contract's formula
/// fails this suite until the reference is updated deliberately. Run with
/// `forge test` in demo/network/evm. Plain `require` carries the checks;
/// forge treats a reverting test function as a failure.
contract DemoStockPriceTest {
    DemoStock private immutable stock = new DemoStock();

    // ----- Reference implementation ----------------------------------------

    uint256 private constant UNIT = 1e18;
    uint256 private constant BASE_PRICE = 40e18;

    function referenceNoise(uint256 layerId, uint256 bucket)
        private
        pure
        returns (int256)
    {
        uint256 hashed = uint256(keccak256(abi.encodePacked(layerId, bucket)));
        return int256(hashed % (2 * UNIT + 1)) - int256(UNIT);
    }

    function referenceNoiseLayerAt(
        uint256 timestamp,
        uint256 layerId,
        uint256 period,
        uint256 amplitude
    ) private pure returns (int256) {
        uint256 bucket = timestamp / period;
        int256 startNoise = referenceNoise(layerId, bucket);
        int256 endNoise = referenceNoise(layerId, bucket + 1);
        int256 interpolated = startNoise +
            ((endNoise - startNoise) * int256(timestamp % period))
            / int256(period);
        return (int256(amplitude) * interpolated) / int256(UNIT);
    }

    function referencePriceAt(uint256 timestamp)
        private
        pure
        returns (uint256)
    {
        int256 offset = referenceNoiseLayerAt(timestamp, 1, 8 hours, 6e18) +
            referenceNoiseLayerAt(timestamp, 2, 10 minutes, 2.5e18) +
            referenceNoiseLayerAt(timestamp, 3, 45 seconds, 0.6e18);
        return uint256(int256(BASE_PRICE) + offset);
    }

    // ----- Equivalence checks ---------------------------------------------

    function requireMatch(uint256 timestamp) private view {
        require(
            stock.priceAt(timestamp) == referencePriceAt(timestamp),
            "price diverged from the reference implementation"
        );
    }

    /// Every layer's bucket boundaries and their immediate neighbors, for
    /// early, historic, and far-future buckets. Boundaries are where the
    /// interpolation restarts, so an off-by-one in bucket or remainder math
    /// shows up here first.
    function testBucketBoundaries() external view {
        uint256[3] memory periods = [uint256(8 hours), 10 minutes, 45];
        // Bucket indexes: the origin, small, a 2026 timestamp's scale, and
        // a far future (year ~33658) scale.
        uint256[4] memory buckets = [uint256(0), 1, 62_000, 1_000_000_000];
        for (uint256 p = 0; p < periods.length; p++) {
            for (uint256 b = 0; b < buckets.length; b++) {
                uint256 boundary = buckets[b] * periods[p];
                if (boundary > 0) requireMatch(boundary - 1);
                requireMatch(boundary);
                requireMatch(boundary + 1);
            }
        }
    }

    /// Fixed spot checks: genesis, a mid-2026 timestamp, one second and one
    /// year ahead of it, and timestamps deep in the future including the
    /// extremes of the sampled range.
    function testKnownTimestamps() external view {
        requireMatch(0);
        requireMatch(1_784_275_616);
        requireMatch(1_784_275_617);
        requireMatch(1_815_811_616);
        requireMatch(32_503_680_000);
        requireMatch(type(uint64).max);
        requireMatch(type(uint256).max);
    }

    /// The full uint256 range: no timestamp makes the two implementations
    /// disagree (the price math cannot overflow, so no bound is needed).
    function testFuzzPriceMatchesReference(uint256 timestamp) external view {
        requireMatch(timestamp);
    }
}
