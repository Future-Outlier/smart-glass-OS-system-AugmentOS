package com.augmentos.asg_client.io.bes.protocol;

/**
 * CRC32 verification per 16KB segment
 * Verifies data integrity after each segment
 */
public class BesCmd_SegmentVerify extends BesBaseCommand {
    public BesCmd_SegmentVerify() {
        super(BesProtocolConstants.SCMD_SEGMENT_VERIFY);
    }

    /**
     * Set the CRC32 checksum for the current segment
     * @param crcBytes CRC32 value as 4-byte array (little-endian)
     */
    public void setSegmentCrc32(byte[] crcBytes) {
        if (crcBytes != null && crcBytes.length == 4) {
            setPlayload(crcBytes);
        }
    }
}

