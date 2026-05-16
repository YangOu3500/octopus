package relay

import (
	"bytes"
	"fmt"
	"io"
	"net/http"

	gatewayvalidator "github.com/bestruirui/octopus/internal/gateway/validator"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

type responseValidationError struct {
	result gatewayvalidator.ValidationResult
}

func (e *responseValidationError) Error() string {
	if e == nil {
		return "response validation failed"
	}
	if e.result.Reason == "" {
		return "response validation failed"
	}
	return fmt.Sprintf("response validation failed: %s", e.result.Reason)
}

func readResponseBody(response *http.Response) ([]byte, error) {
	if response == nil || response.Body == nil {
		return nil, nil
	}
	return io.ReadAll(response.Body)
}

func restoreResponseBody(response *http.Response, body []byte) {
	if response == nil {
		return
	}
	response.Body = io.NopCloser(bytes.NewReader(body))
	response.ContentLength = int64(len(body))
}

func validateNonStreamBody(channelType outbound.OutboundType, response *http.Response, body []byte) error {
	provider, ok := validatorProviderForChannel(channelType)
	if !ok {
		return nil
	}

	result := gatewayvalidator.ValidateNonStream(provider, gatewayvalidator.Response{
		StatusCode: response.StatusCode,
		Header:     response.Header.Clone(),
		Body:       body,
	})
	if result.Status == gatewayvalidator.ValidationOK {
		return nil
	}
	return &responseValidationError{result: result}
}

func validatorProviderForChannel(channelType outbound.OutboundType) (gatewayvalidator.Provider, bool) {
	switch channelType {
	case outbound.OutboundTypeOpenAIChat:
		return gatewayvalidator.ProviderOpenAIChat, true
	case outbound.OutboundTypeOpenAIResponse:
		return gatewayvalidator.ProviderOpenAIResponses, true
	case outbound.OutboundTypeAnthropic:
		return gatewayvalidator.ProviderAnthropic, true
	case outbound.OutboundTypeGemini:
		return gatewayvalidator.ProviderGemini, true
	default:
		return "", false
	}
}

func finalRelayFailureStatus(statusCode int) int {
	if statusCode >= 200 && statusCode < 300 {
		return http.StatusBadGateway
	}
	if statusCode > 0 {
		return statusCode
	}
	return http.StatusBadGateway
}
