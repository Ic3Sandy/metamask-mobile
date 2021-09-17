import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import EditGasFee1559 from '../EditGasFee1559';
import { connect } from 'react-redux';
import { SPEED_UP_RATE, GAS_ESTIMATE_TYPES } from '@metamask/controllers';
import { hexToBN, fromWei, renderFromWei } from '../../../util/number';
import BigNumber from 'bignumber.js';
import { getTicker, parseTransactionEIP1559 } from '../../../util/transactions';
import AppConstants from '../../../core/AppConstants';
import Engine from '../../../core/Engine';
import { strings } from '../../../../locales/i18n';

/**
 * View that renders a list of transactions for a specific asset
 */
const SpeedUpEIP1559TX = ({
	gas,
	accounts,
	selectedAddress,
	ticker,
	existingGas,
	gasFeeEstimates,
	gasEstimateType,
	contractExchangeRates,
	primaryCurrency,
	currentCurrency,
	nativeCurrency,
	conversionRate,
	chainId,
	onCancel,
	onSave,
}) => {
	const [EIP1559TransactionData, setEIP1559TransactionData] = useState({});
	const [animateOnGasChange, setAnimateOnGasChange] = useState(false);
	const [gasSelected, setGasSelected] = useState(AppConstants.GAS_OPTIONS.MEDIUM);
	const stopUpdateGas = useRef(false);
	const onlyDisplayHigh = useRef(false); //Flag to only display high in the event
	const speedUp1559Options = useRef({});
	const pollToken = useRef(undefined);
	const firstTime = useRef(true);

	useEffect(() => {
		if (animateOnGasChange) setAnimateOnGasChange(false);
	}, [animateOnGasChange]);

	useEffect(() => {
		const { GasFeeController } = Engine.context;
		const startGasEstimatePolling = async () => {
			pollToken.current = await GasFeeController.getGasFeeEstimatesAndStartPolling(pollToken.current);
		};

		startGasEstimatePolling();

		return () => {
			GasFeeController.stopPolling(pollToken.current);
		};
	}, []);

	const validateSpeedUpAmount = useCallback(
		(speedUpTx) => {
			let error;

			const speedUpCost = hexToBN(`0x${speedUpTx.totalMaxHex}`);
			const accountBalance = hexToBN(accounts[selectedAddress].balance);
			if (accountBalance.lt(speedUpCost)) {
				const amount = renderFromWei(speedUpCost.sub(accountBalance));
				const tokenSymbol = getTicker(ticker);
				error = strings('transaction.insufficient_amount', { amount, tokenSymbol });
			}

			return error;
		},
		[accounts, selectedAddress, ticker]
	);

	const parseTransactionDataEIP1559 = useCallback(
		(gasFee) => {
			const parsedTransactionEIP1559 = parseTransactionEIP1559(
				{
					gasSelected,
					contractExchangeRates,
					conversionRate,
					currentCurrency,
					nativeCurrency,
					selectedGasFee: { ...gasFee, estimatedBaseFee: gasFeeEstimates.estimatedBaseFee },
					gasFeeEstimates,
				},
				{ onlyGas: true }
			);

			parsedTransactionEIP1559.error = validateSpeedUpAmount(parsedTransactionEIP1559);

			return parsedTransactionEIP1559;
		},
		[
			contractExchangeRates,
			conversionRate,
			currentCurrency,
			gasFeeEstimates,
			nativeCurrency,
			gasSelected,
			validateSpeedUpAmount,
		]
	);

	useEffect(() => {
		if (stopUpdateGas.current) return;
		if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
			const suggestedGasLimit = fromWei(gas, 'wei');

			let speedUpTxEstimates = gasFeeEstimates[gasSelected];

			if (firstTime.current) {
				const newDecMaxFeePerGas = new BigNumber(existingGas.maxFeePerGas).times(new BigNumber(SPEED_UP_RATE));
				const newDecMaxPriorityFeePerGas = new BigNumber(existingGas.maxPriorityFeePerGas).times(
					new BigNumber(SPEED_UP_RATE)
				);

				//Check to see if default SPEED_UP_RATE is greater than current market medium value
				if (
					newDecMaxPriorityFeePerGas.gte(
						new BigNumber(gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas)
					) ||
					newDecMaxFeePerGas.gte(new BigNumber(gasFeeEstimates.medium.suggestedMaxFeePerGas))
				) {
					speedUp1559Options.current = {
						maxPriortyFeeThreshold: newDecMaxPriorityFeePerGas,
						maxFeeThreshold: newDecMaxFeePerGas,
						showAdvanced: true,
					};

					speedUpTxEstimates = {
						selectedOption: undefined,
						suggestedMaxFeePerGas: newDecMaxFeePerGas,
						suggestedMaxPriorityFeePerGas: newDecMaxPriorityFeePerGas,
					};

					onlyDisplayHigh.current = true;
					//Disable polling
					stopUpdateGas.current = true;
					setGasSelected(undefined);
				} else {
					speedUp1559Options.current = {
						maxPriortyFeeThreshold: gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas,
						maxFeeThreshold: gasFeeEstimates.medium.suggestedMaxFeePerGas,
						showAdvanced: false,
					};
					setAnimateOnGasChange(true);
				}
			}

			const EIP1559TransactionData = parseTransactionDataEIP1559({
				...speedUpTxEstimates,
				suggestedGasLimit,
				selectedOption: gasSelected,
			});

			firstTime.current = false;

			setEIP1559TransactionData(EIP1559TransactionData);
		}
	}, [
		existingGas.maxFeePerGas,
		existingGas.maxPriorityFeePerGas,
		gas,
		gasEstimateType,
		gasFeeEstimates,
		gasSelected,
		parseTransactionDataEIP1559,
	]);

	const calculate1559TempGasFee = (gasValues, selected) => {
		if (selected && gas) {
			gasValues.suggestedGasLimit = fromWei(gas, 'wei');
			setAnimateOnGasChange(true);
		}
		setEIP1559TransactionData(parseTransactionDataEIP1559({ ...gasValues, selectedOption: selected }));
		stopUpdateGas.current = !selected;
		setGasSelected(selected);
	};

	const getGasAnalyticsParams = () => ({
		chain_id: chainId,
		gas_estimate_type: gasEstimateType,
		gas_mode: gasSelected ? 'Basic' : 'Advanced',
		speed_set: gasSelected || undefined,
	});

	return (
		<EditGasFee1559
			selected={gasSelected}
			gasFee={EIP1559TransactionData}
			gasOptions={gasFeeEstimates}
			onChange={calculate1559TempGasFee}
			gasFeeNative={EIP1559TransactionData.renderableGasFeeMinNative}
			gasFeeConversion={EIP1559TransactionData.renderableGasFeeMinConversion}
			gasFeeMaxNative={EIP1559TransactionData.renderableGasFeeMaxNative}
			gasFeeMaxConversion={EIP1559TransactionData.renderableGasFeeMaxConversion}
			maxPriorityFeeNative={EIP1559TransactionData.renderableMaxPriorityFeeNative}
			maxPriorityFeeConversion={EIP1559TransactionData.renderableMaxPriorityFeeConversion}
			maxFeePerGasNative={EIP1559TransactionData.renderableMaxFeePerGasNative}
			maxFeePerGasConversion={EIP1559TransactionData.renderableMaxFeePerGasConversion}
			primaryCurrency={primaryCurrency}
			chainId={chainId}
			timeEstimate={EIP1559TransactionData.timeEstimate}
			timeEstimateColor={EIP1559TransactionData.timeEstimateColor}
			timeEstimateId={EIP1559TransactionData.timeEstimateId}
			onCancel={onCancel}
			onSave={() => onSave(EIP1559TransactionData)}
			error={EIP1559TransactionData.error}
			ignoreOptions={
				onlyDisplayHigh.current
					? [AppConstants.GAS_OPTIONS.LOW, AppConstants.GAS_OPTIONS.MEDIUM]
					: [AppConstants.GAS_OPTIONS.LOW]
			}
			speedUpOption={speedUp1559Options.current}
			analyticsParams={getGasAnalyticsParams()}
			view={'Transactions (Speed Up)'}
			animateOnChange={animateOnGasChange}
		/>
	);
};

SpeedUpEIP1559TX.propTypes = {
	/**
	 * Map of accounts to information objects including balances
	 */
	accounts: PropTypes.object,
	/**
	 * ETH to current currency conversion rate
	 */
	conversionRate: PropTypes.number,
	/**
	 * Currency code of the currently-active currency
	 */
	currentCurrency: PropTypes.string,
	/**
	 * Object containing token exchange rates in the format address => exchangeRate
	 */
	contractExchangeRates: PropTypes.object,
	/**
	 * Chain Id
	 */
	chainId: PropTypes.string,
	/**
	 * ETH or fiat, depending on user setting
	 */
	primaryCurrency: PropTypes.string,
	/**
	 * Gas fee estimates returned by the gas fee controller
	 */
	gasFeeEstimates: PropTypes.object,
	/**
	 * Estimate type returned by the gas fee controller, can be market-fee, legacy or eth_gasPrice
	 */
	gasEstimateType: PropTypes.string,
	/**
	 * A string that represents the selected address
	 */
	selectedAddress: PropTypes.string,
	/**
	 * Current provider ticker
	 */
	ticker: PropTypes.string,
	existingGas: PropTypes.object,
	nativeCurrency: PropTypes.string,
	gas: PropTypes.string,
	onCancel: PropTypes.func,
	onSave: PropTypes.func,
};

const mapStateToProps = (state) => ({
	accounts: state.engine.backgroundState.AccountTrackerController.accounts,
	selectedAddress: state.engine.backgroundState.PreferencesController.selectedAddress,
	ticker: state.engine.backgroundState.NetworkController.provider.ticker,
	gasFeeEstimates: state.engine.backgroundState.GasFeeController.gasFeeEstimates,
	gasEstimateType: state.engine.backgroundState.GasFeeController.gasEstimateType,
	contractExchangeRates: state.engine.backgroundState.TokenRatesController.contractExchangeRates,
	currentCurrency: state.engine.backgroundState.CurrencyRateController.currentCurrency,
	nativeCurrency: state.engine.backgroundState.CurrencyRateController.nativeCurrency,
	conversionRate: state.engine.backgroundState.CurrencyRateController.conversionRate,
	primaryCurrency: state.settings.primaryCurrency,
	chainId: state.engine.backgroundState.NetworkController.provider.chainId,
});

export default connect(mapStateToProps)(SpeedUpEIP1559TX);
