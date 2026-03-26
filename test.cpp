#include <iostream>
#include <string>

/**
 * @brief Processes an incoming transaction.
 * @param amount The transaction amount.
 * @param sender The ID of the sender.
 * @return True if processed successfully, false otherwise.
 */
bool ProcessTransaction(double amount, const std::string& sender) {
    if (amount <= 0.0) {
        return false;
    }
    if (sender.empty()) {
        return false;
    }
    
    // Simulate some logic
    std::cout << "Processing " << amount << " for " << sender << std::endl;
    return true;
}

/**
 * @brief Computes the cryptographic hash of a payload.
 * Useful for fuzz testing.
 */
int ComputeHash(const char* payload, size_t length) {
    if (length == 0 || payload == nullptr) return 0;
    
    int hash = 5381;
    for (size_t i = 0; i < length; ++i) {
        hash = ((hash << 5) + hash) + payload[i]; /* hash * 33 + c */
    }
    return hash;
}
