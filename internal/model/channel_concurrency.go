package model

type ChannelConcurrencyLease struct {
	ID         int64  `json:"id" gorm:"primaryKey"`
	ChannelID  int    `json:"channel_id" gorm:"not null;uniqueIndex:idx_channel_model_slot;index:idx_channel_model_lookup"`
	ModelName  string `json:"model_name" gorm:"size:191;not null;uniqueIndex:idx_channel_model_slot;index:idx_channel_model_lookup"`
	Slot       int    `json:"slot" gorm:"not null;uniqueIndex:idx_channel_model_slot"`
	LeaseToken string `json:"lease_token" gorm:"size:64;not null;uniqueIndex"`
	AcquiredAt int64  `json:"acquired_at" gorm:"not null;index"`
	ExpiresAt  int64  `json:"expires_at" gorm:"not null;index"`
}
