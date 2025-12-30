#!/usr/bin/env bash
#
# Setup UDP LoadBalancer service for a cloud environment
#
# Usage:
#   ./cloud/scripts/setup-udp-service.sh --app cloud-debug --cluster 4689
#   ./cloud/scripts/setup-udp-service.sh --app cloud-prod --cluster 4696
#   ./cloud/scripts/setup-udp-service.sh --status
#
# See cloud/issues/udp-loadbalancer/ for full documentation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
APP_NAME=""
CLUSTER_ID=""
UDP_PORT=8000
SHOW_STATUS=false
NAMESPACE="default"

get_cluster_name() {
    case $1 in
        4689) echo "US Central" ;;
        4696) echo "France" ;;
        4754) echo "East Asia" ;;
        4753) echo "Canada Central" ;;
        4965) echo "US West" ;;
        4977) echo "US East" ;;
        4978) echo "Australia East" ;;
        *) echo "Unknown" ;;
    esac
}

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --app <name>        App name (e.g., cloud-debug, cloud-prod)"
    echo "  --cluster <id>      Cluster ID (e.g., 4689, 4696, 4754)"
    echo "  --status            Show status of all UDP services"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --app cloud-debug --cluster 4689"
    echo "  $0 --app cloud-prod --cluster 4696"
    echo "  $0 --status"
    echo ""
    echo "Known clusters:"
    echo "  4689 - US Central (mentra-cluster-central-us)"
    echo "  4696 - France"
    echo "  4754 - East Asia"
    echo "  4753 - Canada Central"
    echo "  4965 - US West"
    echo "  4977 - US East"
    echo "  4978 - Australia East"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

check_porter() {
    if ! command -v porter &> /dev/null; then
        log_error "Porter CLI not found. Install with: brew install porter-dev/porter/porter"
        exit 1
    fi
}

switch_cluster() {
    local cluster_id=$1
    local cluster_name
    cluster_name=$(get_cluster_name "$cluster_id")
    log_info "Switching to cluster $cluster_id ($cluster_name)..."
    porter config set-cluster "$cluster_id" > /dev/null 2>&1
    log_success "Switched to cluster $cluster_id"
}

generate_service_yaml() {
    local app_name=$1
    cat <<EOF
apiVersion: v1
kind: Service
metadata:
  name: ${app_name}-udp
  namespace: ${NAMESPACE}
  labels:
    porter.run/app-name: ${app_name}
    app.kubernetes.io/managed-by: setup-udp-service-script
  annotations:
    description: "UDP LoadBalancer for audio streaming (not managed by Porter)"
spec:
  type: LoadBalancer
  selector:
    porter.run/app-name: ${app_name}
    porter.run/service-name: cloud
  ports:
    - name: udp-audio
      protocol: UDP
      port: ${UDP_PORT}
      targetPort: ${UDP_PORT}
EOF
}

apply_service() {
    local app_name=$1

    log_info "Generating UDP service manifest for ${app_name}..."

    # Check if app exists
    if ! porter kubectl -- get pods -l "porter.run/app-name=${app_name}" --no-headers 2>/dev/null | grep -q .; then
        log_error "No pods found for app '${app_name}' in this cluster"
        log_info "Available apps:"
        porter kubectl -- get pods -l "porter.run/app-name" -o jsonpath='{range .items[*]}{.metadata.labels.porter\.run/app-name}{"\n"}{end}' 2>/dev/null | sort -u | head -10
        exit 1
    fi

    log_info "Applying UDP service..."
    generate_service_yaml "$app_name" | porter kubectl -- apply -f - 2>/dev/null
    log_success "Service ${app_name}-udp applied"

    # Wait for IP
    log_info "Waiting for LoadBalancer IP (this may take 30-60 seconds)..."
    local ip=""
    for i in {1..30}; do
        ip=$(porter kubectl -- get svc "${app_name}-udp" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
        if [ -n "$ip" ] && [ "$ip" != "null" ]; then
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""

    if [ -n "$ip" ] && [ "$ip" != "null" ]; then
        log_success "LoadBalancer IP assigned: ${ip}"
        echo ""
        echo "═══════════════════════════════════════════════════════════"
        echo -e " ${GREEN}UDP Service Ready${NC}"
        echo "═══════════════════════════════════════════════════════════"
        echo ""
        echo "  Service:  ${app_name}-udp"
        echo "  IP:       ${ip}"
        echo "  Port:     ${UDP_PORT}"
        echo "  Endpoint: ${ip}:${UDP_PORT}"
        echo ""
        echo "  Test with:"
        echo "    python3 -c \"import socket,struct; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.sendto(struct.pack('>IH',0x12345678,1)+b'PING',('${ip}',${UDP_PORT}))\""
        echo ""
        echo "  Optional DNS (Cloudflare, DNS-only mode):"
        echo "    udp.{env}.augmentos.cloud → ${ip}"
        echo ""
        echo "═══════════════════════════════════════════════════════════"
    else
        log_warn "LoadBalancer IP not yet assigned. Check status with:"
        echo "  porter kubectl -- get svc ${app_name}-udp"
    fi
}

show_status() {
    echo ""
    echo "UDP Services Status"
    echo "═══════════════════════════════════════════════════════════════════════════"
    printf "%-15s %-8s %-20s %-25s\n" "APP" "CLUSTER" "REGION" "UDP ENDPOINT"
    echo "───────────────────────────────────────────────────────────────────────────"

    local apps="cloud-debug cloud-dev cloud-staging cloud-prod"

    # Check each cluster
    for cluster_id in 4689 4696 4754; do
        # Switch cluster
        porter config set-cluster "$cluster_id" > /dev/null 2>&1 || continue

        for app in $apps; do
            # Skip non-prod apps on non-main clusters
            if [ "$cluster_id" != "4689" ] && [ "$app" != "cloud-prod" ]; then
                continue
            fi

            # Check if service exists
            local ip
            ip=$(porter kubectl -- get svc "${app}-udp" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
            local region
            region=$(get_cluster_name "$cluster_id")

            if [ -n "$ip" ] && [ "$ip" != "null" ]; then
                printf "%-15s %-8s %-20s ${GREEN}%-25s${NC}\n" "$app" "$cluster_id" "$region" "${ip}:${UDP_PORT}"
            else
                # Check if app exists at all
                if porter kubectl -- get pods -l "porter.run/app-name=${app}" --no-headers 2>/dev/null | grep -q .; then
                    printf "%-15s %-8s %-20s ${YELLOW}%-25s${NC}\n" "$app" "$cluster_id" "$region" "(not created)"
                fi
            fi
        done
    done

    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "To create a UDP service:"
    echo "  $0 --app <app-name> --cluster <cluster-id>"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --app)
            APP_NAME="$2"
            shift 2
            ;;
        --cluster)
            CLUSTER_ID="$2"
            shift 2
            ;;
        --status)
            SHOW_STATUS=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main
check_porter

if [ "$SHOW_STATUS" = true ]; then
    show_status
    exit 0
fi

if [ -z "$APP_NAME" ] || [ -z "$CLUSTER_ID" ]; then
    log_error "Both --app and --cluster are required"
    echo ""
    usage
    exit 1
fi

switch_cluster "$CLUSTER_ID"
apply_service "$APP_NAME"
