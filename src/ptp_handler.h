#pragma once
#include <string>
#include <vector>

namespace Hardware {

/**
 * @brief Low-level driver for PTP synchronization.
 */
class PtpHandler {
public:
    PtpHandler() = default;
    virtual ~PtpHandler() = default;

    // Static member to mock
    static PtpHandler* getInstance();

    // Instance methods
    virtual bool initialize(int port = 8080);
    virtual void sendSync(const std::string& data);
    virtual std::vector<uint8_t> receiveData();

    // Static helper to mock
    static void resetHardware();
};

// Free function in namespace to mock
void globalReset(bool hard = false);

} // namespace Hardware
