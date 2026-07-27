## Scope

1. Ship the banner centred, without the empty-results notice
2. Change the tooltip trigger to every first add
3. ~~Aggregate inactive filters into one trailing pill~~
4. ~~Open the filter drawer expanded (non applied)~~

Design: https://figma.example/file/abc

### Snippet

```php
$html = strtr($html, ['%K3W_TITLE%' => $title]);
// keep -this- literal and *these* asterisks
```
