#pragma once
#include <string>
#include <vector>

class BankStorage {
public:
    virtual ~BankStorage() = default;
    virtual bool saveTransaction(const std::string& accountId, double amount) = 0;
    virtual double getBalance(const std::string& accountId) const = 0;
    virtual std::vector<std::string> listAccounts() const = 0;
    
    static BankStorage* getInstance();
};
