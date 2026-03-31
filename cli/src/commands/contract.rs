use alloy::primitives::Address;
use alloy::providers::ProviderBuilder;
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use clap::Subcommand;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

const ALICE_KEY: &str = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const BOB_KEY: &str = "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b";
const CHARLIE_KEY: &str = "0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262";

sol! {
    #[sol(rpc)]
    contract Counter {
        function getCounter(address account) external view returns (uint256);
        function setCounter(uint256 value) external;
        function increment() external;
    }
}

#[derive(Debug, Deserialize)]
pub struct Deployments {
    pub evm: Option<String>,
    pub pvm: Option<String>,
}

#[derive(Subcommand)]
pub enum ContractAction {
    /// Show deployed contract addresses and dev accounts
    Info,
    /// Get the counter value for an account
    Get {
        /// Contract type: evm or pvm
        #[arg(value_parser = ["evm", "pvm"])]
        contract_type: String,
        /// Account name (alice, bob, charlie) or Ethereum address (0x...)
        #[arg(default_value = "alice")]
        account: String,
    },
    /// Set the counter to a value
    Set {
        /// Contract type: evm or pvm
        #[arg(value_parser = ["evm", "pvm"])]
        contract_type: String,
        /// Value to set
        value: u64,
        /// Signing account (alice, bob, charlie)
        #[arg(long, default_value = "alice")]
        signer: String,
    },
    /// Increment the counter
    Increment {
        /// Contract type: evm or pvm
        #[arg(value_parser = ["evm", "pvm"])]
        contract_type: String,
        /// Signing account (alice, bob, charlie)
        #[arg(long, default_value = "alice")]
        signer: String,
    },
}

fn resolve_signer(name: &str) -> Result<PrivateKeySigner, Box<dyn std::error::Error>> {
    let lowered = name.to_lowercase();
    let key = match lowered.as_str() {
        "alice" => ALICE_KEY,
        "bob" => BOB_KEY,
        "charlie" => CHARLIE_KEY,
        hex if hex.starts_with("0x") => hex,
        _ => return Err(format!("Unknown signer: {name}. Use alice, bob, or charlie.").into()),
    };
    Ok(key.parse()?)
}

fn resolve_address(account: &str) -> Result<Address, Box<dyn std::error::Error>> {
    match account.to_lowercase().as_str() {
        "alice" => Ok(resolve_signer("alice")?.address()),
        "bob" => Ok(resolve_signer("bob")?.address()),
        "charlie" => Ok(resolve_signer("charlie")?.address()),
        addr if addr.starts_with("0x") => Ok(addr.parse()?),
        _ => Err(format!("Unknown account: {account}. Use alice, bob, charlie, or an 0x address.").into()),
    }
}

fn load_deployments() -> Result<Deployments, Box<dyn std::error::Error>> {
    let paths = [
        PathBuf::from("deployments.json"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../deployments.json"),
    ];
    for path in &paths {
        if path.exists() {
            let content = fs::read_to_string(path)?;
            return Ok(serde_json::from_str(&content)?);
        }
    }
    Err("deployments.json not found. Deploy contracts first.".into())
}

fn get_contract_address(
    deployments: &Deployments,
    contract_type: &str,
) -> Result<Address, Box<dyn std::error::Error>> {
    let addr = match contract_type {
        "evm" => deployments.evm.as_deref(),
        "pvm" => deployments.pvm.as_deref(),
        _ => None,
    };
    let addr_str = addr.ok_or_else(|| -> Box<dyn std::error::Error> {
        format!(
            "{} contract not deployed. Run: cd contracts/{} && npm run deploy:local",
            contract_type.to_uppercase(),
            contract_type
        )
        .into()
    })?;
    Ok(addr_str.parse()?)
}

pub async fn run(
    action: ContractAction,
    eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ContractAction::Info => {
            let deployments = load_deployments()?;
            println!("Deployed Contracts");
            println!("==================");
            println!(
                "EVM (solc):    {}",
                deployments.evm.as_deref().unwrap_or("not deployed")
            );
            println!(
                "PVM (resolc):  {}",
                deployments.pvm.as_deref().unwrap_or("not deployed")
            );
            println!();
            println!("Dev Accounts (Ethereum)");
            println!("=======================");
            for name in ["alice", "bob", "charlie"] {
                let signer = resolve_signer(name)?;
                println!("{:<10} {}", format!("{}:", capitalize(name)), signer.address());
            }
        }
        ContractAction::Get {
            contract_type,
            account,
        } => {
            let deployments = load_deployments()?;
            let contract_addr = get_contract_address(&deployments, &contract_type)?;
            let account_addr = resolve_address(&account)?;

            let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
            let counter = Counter::new(contract_addr, &provider);
            let result = counter.getCounter(account_addr).call().await?;

            println!(
                "Counter for {} on {} contract: {}",
                account,
                contract_type.to_uppercase(),
                result
            );
        }
        ContractAction::Set {
            contract_type,
            value,
            signer,
        } => {
            let deployments = load_deployments()?;
            let contract_addr = get_contract_address(&deployments, &contract_type)?;
            let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);

            let provider = ProviderBuilder::new()
                .wallet(wallet)
                .connect_http(eth_rpc_url.parse()?);
            let counter = Counter::new(contract_addr, &provider);

            println!("Submitting setCounter({value}) to {} contract...", contract_type.to_uppercase());
            let pending = counter
                .setCounter(alloy::primitives::U256::from(value))
                .send()
                .await?;
            let receipt = pending.get_receipt().await?;
            println!(
                "Confirmed in block {}: tx {}",
                receipt.block_number.unwrap_or_default(),
                receipt.transaction_hash
            );
        }
        ContractAction::Increment {
            contract_type,
            signer,
        } => {
            let deployments = load_deployments()?;
            let contract_addr = get_contract_address(&deployments, &contract_type)?;
            let wallet = alloy::network::EthereumWallet::from(resolve_signer(&signer)?);

            let provider = ProviderBuilder::new()
                .wallet(wallet)
                .connect_http(eth_rpc_url.parse()?);
            let counter = Counter::new(contract_addr, &provider);

            println!("Submitting increment() to {} contract...", contract_type.to_uppercase());
            let pending = counter
                .increment()
                .send()
                .await?;
            let receipt = pending.get_receipt().await?;
            println!(
                "Confirmed in block {}: tx {}",
                receipt.block_number.unwrap_or_default(),
                receipt.transaction_hash
            );
        }
    }

    Ok(())
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}
