package op

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/utils/cache"
	"gorm.io/gorm"
)

// sitePriceCache：分片缓存，键为 "accountID:groupKey:modelName"（modelName 统一小写）。
// 键格式对齐 SiteChannelBinding 中 base group key（经 ParseSiteChannelBindingKey 剥离 route 后缀）。
var sitePriceCache = cache.New[string, model.LLMPrice](16)

func sitePriceCacheKey(accountID int, groupKey, modelName string) string {
	return fmt.Sprintf("%d:%s:%s",
		accountID,
		model.NormalizeSiteGroupKey(groupKey),
		strings.ToLower(strings.TrimSpace(modelName)),
	)
}

// SitePriceGet 查询指定 (账号, 分组, 模型) 的价格。
func SitePriceGet(accountID int, groupKey, modelName string) (model.LLMPrice, bool) {
	return sitePriceCache.Get(sitePriceCacheKey(accountID, groupKey, modelName))
}

type SitePriceAggregate struct {
	Price        model.LLMPrice
	SiteAccounts int
	Groups       int
	UpdatedAt    time.Time
}

func SitePriceResolveModel(ctx context.Context, modelName string) (SitePriceAggregate, bool, error) {
	normalizedModel := strings.ToLower(strings.TrimSpace(modelName))
	if normalizedModel == "" {
		return SitePriceAggregate{}, false, nil
	}

	var prices []model.SitePrice
	if err := db.GetDB().WithContext(ctx).
		Where("LOWER(model_name) = ?", normalizedModel).
		Order("updated_at DESC").
		Find(&prices).Error; err != nil {
		return SitePriceAggregate{}, false, err
	}
	if len(prices) == 0 {
		return SitePriceAggregate{}, false, nil
	}

	filtered := make([]model.SitePrice, 0, len(prices))
	for _, item := range prices {
		if item.InputPrice <= 0 && item.OutputPrice <= 0 && item.CacheReadPrice <= 0 && item.CacheWritePrice <= 0 {
			continue
		}
		filtered = append(filtered, item)
	}
	if len(filtered) == 0 {
		return SitePriceAggregate{}, false, nil
	}

	defaultGroup := make([]model.SitePrice, 0, len(filtered))
	for _, item := range filtered {
		if model.NormalizeSiteGroupKey(item.GroupKey) == model.SiteDefaultGroupKey {
			defaultGroup = append(defaultGroup, item)
		}
	}
	selected := filtered
	if len(defaultGroup) > 0 {
		selected = defaultGroup
	}

	var aggregate SitePriceAggregate
	accountSet := make(map[int]struct{}, len(selected))
	groupSet := make(map[string]struct{}, len(selected))
	for _, item := range selected {
		aggregate.Price.Input += item.InputPrice
		aggregate.Price.Output += item.OutputPrice
		aggregate.Price.CacheRead += item.CacheReadPrice
		aggregate.Price.CacheWrite += item.CacheWritePrice
		accountSet[item.SiteAccountID] = struct{}{}
		groupSet[model.NormalizeSiteGroupKey(item.GroupKey)] = struct{}{}
		if item.UpdatedAt.After(aggregate.UpdatedAt) {
			aggregate.UpdatedAt = item.UpdatedAt
		}
	}

	divisor := float64(len(selected))
	aggregate.Price.Input /= divisor
	aggregate.Price.Output /= divisor
	aggregate.Price.CacheRead /= divisor
	aggregate.Price.CacheWrite /= divisor
	aggregate.SiteAccounts = len(accountSet)
	aggregate.Groups = len(groupSet)
	return aggregate, true, nil
}

func SiteGroupRatioGet(ctx context.Context, accountID int, groupKey string) (float64, bool, error) {
	var price model.SitePrice
	err := db.GetDB().WithContext(ctx).
		Where("site_account_id = ? AND group_key = ? AND group_ratio > 0", accountID, model.NormalizeSiteGroupKey(groupKey)).
		Order("id ASC").
		First(&price).Error
	if err == nil {
		return price.GroupRatio, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, false, nil
	}
	return 0, false, err
}

// SitePriceReplaceAccount 用给定 prices 完整替换某账号下的缓存，并持久化到 DB。
// 调用方需在同一事务/串行上下文中使用，避免与并发 sync 冲突。
func SitePriceReplaceAccount(ctx context.Context, accountID int, prices []model.SitePrice) error {
	if err := db.GetDB().WithContext(ctx).Where("site_account_id = ?", accountID).Delete(&model.SitePrice{}).Error; err != nil {
		return err
	}
	sitePriceClearCacheForAccount(accountID)
	if len(prices) == 0 {
		return nil
	}
	normalized := make([]model.SitePrice, 0, len(prices))
	seen := make(map[string]struct{}, len(prices))
	for i := range prices {
		p := prices[i]
		p.SiteAccountID = accountID
		p.GroupKey = model.NormalizeSiteGroupKey(p.GroupKey)
		p.ModelName = strings.TrimSpace(p.ModelName)
		if p.ModelName == "" {
			continue
		}
		key := sitePriceCacheKey(accountID, p.GroupKey, p.ModelName)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, p)
	}
	if len(normalized) == 0 {
		return nil
	}
	if err := db.GetDB().WithContext(ctx).Create(&normalized).Error; err != nil {
		return err
	}
	for _, p := range normalized {
		sitePriceCache.Set(sitePriceCacheKey(p.SiteAccountID, p.GroupKey, p.ModelName), p.ToLLMPrice())
	}
	return nil
}

// SitePriceDeleteAccount 清理账号下的所有价格（供账号删除时调用）。
func SitePriceDeleteAccount(ctx context.Context, accountID int) error {
	if err := db.GetDB().WithContext(ctx).Where("site_account_id = ?", accountID).Delete(&model.SitePrice{}).Error; err != nil {
		return err
	}
	sitePriceClearCacheForAccount(accountID)
	return nil
}

// SitePriceCacheReplaceAccount 只刷新内存缓存，调用方需确保 DB 侧已以同样数据持久化完成。
// 适用于持久化已在外部事务内完成、需要在事务提交后同步缓存的场景。
func SitePriceCacheReplaceAccount(accountID int, prices []model.SitePrice) {
	sitePriceClearCacheForAccount(accountID)
	for _, p := range prices {
		modelName := strings.TrimSpace(p.ModelName)
		if modelName == "" {
			continue
		}
		sitePriceCache.Set(sitePriceCacheKey(accountID, p.GroupKey, modelName), p.ToLLMPrice())
	}
}

func sitePriceClearCacheForAccount(accountID int) {
	prefix := fmt.Sprintf("%d:", accountID)
	for key := range sitePriceCache.GetAll() {
		if strings.HasPrefix(key, prefix) {
			sitePriceCache.Del(key)
		}
	}
}

func sitePriceRefreshCache(ctx context.Context) error {
	var prices []model.SitePrice
	if err := db.GetDB().WithContext(ctx).Find(&prices).Error; err != nil {
		return err
	}
	for _, p := range prices {
		sitePriceCache.Set(sitePriceCacheKey(p.SiteAccountID, p.GroupKey, p.ModelName), p.ToLLMPrice())
	}
	return nil
}
