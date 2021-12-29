// lib/vpc-endpoints-stack.ts

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kds from "aws-cdk-lib/aws-kinesis";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class VpcEndpointsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Configurable parameters to be passed to CloudFormation stack
     * upon deployment
     */
    const keyPair = new cdk.CfnParameter(this, 'keypair', {
      type: 'String',
      description: 'EC2 Key Pair Name'
    });
    const sshSafeIp = new cdk.CfnParameter(this, 'safeip', {
      type: 'String', 
      description: 'IP Address with /32 suffix to Allow SSH Connections from'
    });


    /**
     * VPC in Single Availability Zone
     * - IPs from 10.0.0.1 to 10.0.15.254 (4,096 addresses) along with a 
     * - Public subnet (/24 256 addresses) with route to Internet Gateway
     * - Private subnet (/24 256 addresses) with no route to Internet (no NAT)
     */
    const vpc = new ec2.Vpc(this, 'VPC-Endpoints', {
      natGateways: 0,
      cidr: '10.0.0.0/20',
      maxAzs: 1,
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: 'private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true
    });
    const s3GatewayEndpoint = vpc.addGatewayEndpoint('s3-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3
    });
    const kinesisInterfaceEndpoint = vpc.addInterfaceEndpoint('kinesis-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KINESIS_STREAMS,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
    });


    /**
     * Security Group Allowing SSH Connections from specific IP
     * along with all TCP traffic among EC2s within VPC
     */
    const ec2SecurityGroup = new ec2.SecurityGroup(this, 'ssh-security-group', {
      vpc: vpc,
      description: 'Allow SSH (TCP port 22) from Anywhere and All TCP within VPC',
      allowAllOutbound: true
    });
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(sshSafeIp.valueAsString),
      ec2.Port.tcp(22), 'Allow SSH from Specific IP'
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.allTcp(), 
      'Allow all TCP within VPC'
    );


    /**
     * AWS S3 and AWS Kinesis are AWS Services Accessible via Internet Gateway (publicly)
     * or VPC Endpoints (privately)
     */
     const s3Bucket = new s3.Bucket(this, 'vpc-endpoints-bkt');
     const kdsStream = new kds.Stream(this, 'vpc-endpoints-stream');


    /**
     * EC2 Instance Role with IAM Policies allowing EC2's to work with
     * the AWS S3 bucket and AWS Kinesis Data Stream defined previously.
     */
    const ec2Role = new iam.Role(this, 'ec2-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ],
        resources: [s3Bucket.bucketArn, `${s3Bucket.bucketArn}/*`]
      })
    );
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "kinesis:*"
        ],
        resources: [kdsStream.streamArn]
      })
    );


    /**
     * Create two Amazon Linux 2 AMI EC2 Instances within VPC containing
     * previously defined IAM roles and Security Groups.
     * - one in public subnet
     * - one in private subnet
     */
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.X86_64
    });

    const publicEc2 = new ec2.Instance(this, 'pub-ec2-vpc-endpts', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ami,
      role: ec2Role,
      securityGroup: ec2SecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyName: keyPair.valueAsString
    });

    const privateEc2 = new ec2.Instance(this, 'priv-ec2-vpc-endpts', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ami,
      role: ec2Role,
      securityGroup: ec2SecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      keyName: keyPair.valueAsString
    });


    /**
     * Dynamically generated resource values to display in output of CloudFormation
     */
    new cdk.CfnOutput(this, 'Ec2PublicIp', {
      value: publicEc2.instancePublicIp
    });
    new cdk.CfnOutput(this, 'Ec2PrivateIp', {
      value: privateEc2.instancePrivateIp
    });
    new cdk.CfnOutput(this, 'S3Bucket', {
      value: s3Bucket.bucketName
    });
    new cdk.CfnOutput(this, 'KdsStream', {
      value: kdsStream.streamName
    });
    new cdk.CfnOutput(this, 'S3GatewayEndpoint', {
      value: s3GatewayEndpoint.vpcEndpointId
    });
    new cdk.CfnOutput(this, 'KinesisInterfaceEndpoint', {
      value: kinesisInterfaceEndpoint.vpcEndpointId
    });
  }
}
