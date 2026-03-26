#include <iostream>
#include <string>

/**
 * @brief Authenticates a user based on their credentials token.
 * @pre token must not be empty.
 * @return True if valid, false otherwise.
 */
bool authenticateUser(const std::string& token) {
    if (token.empty()) return false;
    return token == "valid_token";
}

int helperFunction(int a) {
    return a + 1;
}

class ConfigManager {
public:
    /**
     * @brief Parses a configuration file.
     * @warning Throws std::invalid_argument if path is missing.
     */
    void parse(const std::string& path) {
        if (path.empty()) throw std::invalid_argument("Path empty");
    }
};
