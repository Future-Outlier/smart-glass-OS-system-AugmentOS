package com.augmentos.asg_client.io.bes.protocol;

/**
 * Read current firmware version from BES
 * Returns version info including magic code and version bytes
 */
public class BesCmd_GetFirmwareVersion extends BesBaseCommand {
    public BesCmd_GetFirmwareVersion() {
        super(BesProtocolConstants.SCMD_GET_FIRMWARE_VERSION);
    }
}

